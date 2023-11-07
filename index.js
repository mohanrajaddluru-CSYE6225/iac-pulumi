const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');

const config = new pulumi.Config();
var vpcCIDR = config.require('cidrBlock');
const publicCidrBlock = config.require('publicCidrBlock');
const launchAmi = config.require('launchAMIID');
const keyPair = config.require('keyPairName');
const dbUser = config.require('dbUser');
const dbPasswd = config.require('dbPasswd');
const port = config.require('port');
const dbName = config.require('dbName');
const dbInstanceClass = config.require('dbInstanceClass');
const dbParamterGroup = config.require('dbParamterGroup');
const mysqlFamily = config.require('mysqlFamily');
const zoneId = config.require('zoneId');




const myVPC = new aws.ec2.Vpc("Webapp VPC", {
    cidrBlock:vpcCIDR,
    tags: {
        Name: "Webapp VPC network",
    },
});

const internetGw = new aws.ec2.InternetGateway("Webapp Gateway", {
    vpcId: myVPC.id,
    tags: {
        Name: "Webapp Gateway",
    },
});

const publicRouteTable = new aws.ec2.RouteTable('publicRouteTable', {
    vpcId: myVPC.id,
    routes: [
        {
            cidrBlock: publicCidrBlock,
            gatewayId: internetGw.id,
        }],
    tags: { 
        "Name" : "PublicRouteTable" 
    },
});

const privateRouteTable = new aws.ec2.RouteTable('privateRouteTable', {
    vpcId: myVPC.id,
    tags: { 
        "Name" : "PrivateRouteTable" 
    },
});

const available = aws.getAvailabilityZones({state: "available"});


available
.then(availableZones => 
    {
        const currZones = availableZones.names.slice(0,3);
        // console.log(currZones);
        var i=1;
        let publicSubnets = [];
        let privateSubnets = [];
        currZones.forEach((az,index) => 
        {
            const thirdOctet = index + 1;
            const publicSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${thirdOctet}.0/24`;
            const privateSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${(parseInt(thirdOctet) * 10)}.0/24`;
            const publicSubnet = new aws.ec2.Subnet(`public-subnet-${az}`, {
                vpcId: myVPC.id,
                cidrBlock: publicSubnetCIDR,
                availabilityZone: az,
                mapPublicIpOnLaunch: true,
                tags: {
                    "Name" : `publicSubnet-${i}`
                },
            });
            const publicRouteTableAssociation = new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${az}`, {
                subnetId: publicSubnet.id,
                routeTableId: publicRouteTable.id,
            });
            const privateSubnet = new aws.ec2.Subnet(`private-subnet-${az}`, {
                vpcId: myVPC.id,
                cidrBlock: privateSubnetCIDR,
                availabilityZone: az,
                tags: {
                    "Name" : `privateSubnet-${i}`
                },
            });
            const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}`, {
                subnetId: privateSubnet.id,
                routeTableId: privateRouteTable.id,
            });
            publicSubnets.push(publicSubnet.id);
            privateSubnets.push(privateSubnet.id);
            i=i+1;
        })
        // console.log(publicSubnets,"public subnets");
        // console.log(privateSubnets,"private subnets");
        const mySQLRDS = new aws.rds.Instance("webappmysql", {
            allocatedStorage: 20,
            dbName: dbName,
            engine: "mysql",
            engineVersion: "8.0.33",
            instanceClass: dbInstanceClass,
            parameterGroupName: rdsParamterGroup.name,
            password: dbPasswd,
            skipFinalSnapshot: true,
            username: dbUser,
            dbSubnetGroupName: new aws.rds.SubnetGroup(`rdssubnetgroup-sg`, {
                subnetIds: privateSubnets,
            }),
            multiAz:0,
            port:3306,
            publiclyAccessible:0,
            vpcSecurityGroupIds:[rdsSecurityGroup.id],
            tags: 
            {
                Name: "webapp-rds-mysql",
            }
        });

        const rdsEndpoint = mySQLRDS.endpoint;

        const hostname = rdsEndpoint.apply(endpoint => {
            const parts = endpoint.split(":"); // Split the endpoint by ":"
            return parts[0]; // Take the first part, which is the hostname
        });

        const ec2Role = new aws.iam.Role("EC2Role", {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                    },
                ],
            }),
        });
     
        const cloudWatchAgentPolicyAttachment = new aws.iam.RolePolicyAttachment("ec2CloudWatchPolicy", {
            role: ec2Role.name,
            policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
        });
     
        const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
            role: ec2Role.name,
        });

        const createEC2 = new aws.ec2.Instance("CreateEC2", {
            ami: launchAmi,
            instanceType: "t2.micro",
            vpcSecurityGroupIds: [appSecurityGroup.id],
            vpcId: myVPC.id,
            subnetId: publicSubnets[0],
            disableApiTermination: 0,
            volumeSize: 25,
            volumeType: "gp2",
            keyName: keyPair,
            iamInstanceProfile: instanceProfile.name,
            associatePublicIpAddress : 1,
            userData: pulumi.interpolate`#!/bin/bash\nrm /home/webappuser/webapp/.env\necho "DATABASE_HOST: ${hostname}" >> /home/webappuser/webapp/.env\necho "DATABASE_USER: ${dbUser}" >> /home/webappuser/webapp/.env\necho "DATABASE_PASSWORD: ${dbPasswd}" >> /home/webappuser/webapp/.env\necho "DATABASE_NAME: ${dbName}" >> /home/webappuser/webapp/.env\necho "PORT: ${port}" >> /home/webappuser/webapp/.env\nchown webappuser:webappuser /home/webappuser/webapp/.env\nsudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/cloudwatch-config.json`,
            tags: 
            {
                Name: "dev-iam-2",
            }
        });

        const domainrecord = new aws.route53.Record("domainrecord", {
            zoneId: zoneId,
            name: '',
            type: "A",
            records: [createEC2.publicIp],
            ttl: 300
        });

        // exports.createEC2=createEC2;
        // exports.mySQLRDS=mySQLRDS;
    }
);

const appSecurityGroup = new aws.ec2.SecurityGroup("my-app-security-group", {
    description: "My security group",
    vpcId: myVPC.id,
    ingress: [{
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },{
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },{
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },{
        fromPort: 8080,
        toPort: 8080,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    egress:[{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: 
    {
        Name: "Application Security Group"
    }
});

const rdsSecurityGroup = new aws.ec2.SecurityGroup("rds-security-group", {
    description: "Security group for rds",
    vpcId: myVPC.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 3306,
            toPort: 3306,
            securityGroups: [ appSecurityGroup.id ],
        },
    ],
    egress:[{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: 
    {
        Name: "RDS Security Group"
    }
})


const rdsParamterGroup = new aws.rds.ParameterGroup("default", {
    name: "rds-parameter-group",
    family: mysqlFamily,
    description: `Mysql ${mysqlFamily} Family group`,
    parameters: [
        {
            name: "max_connections",
            value: "100",
        },
        {
            name: "innodb_buffer_pool_size",
            value: "268435456",
        },
    ],
});





exports.vpcId = myVPC.id;
exports.internetGw = internetGw.id;
exports.publicRouteTable=publicRouteTable.id;
exports.privateRouteTable=privateRouteTable.id;
exports.rdsSecurityGroup=rdsSecurityGroup.id;
// exports.policyAttachment=policyAttachment.id;
// exports.role=role;
