const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');

const config = new pulumi.Config();

var vpcCIDR = config.require('cidrBlock');
const publicCidrBlock = config.require('publicCidrBlock');
const launchAmi = config.require('launchAMIID');
const tags = config.getObject('tags');
const keyPair = config.require('keyPairName');


const vpc = new aws.ec2.Vpc('my-vpc', {
    cidrBlock: vpcCIDR,
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags : { 
        "Name" : "VPC CREATED FROM Script" 
    }
});

const debianAmi = aws.ec2.getAmi({
    mostRecent: true,
    filters: [
        {
            name: "name",
            values: ["csye6225*"],
        },
        {
            name: "virtualization-type",
            values: ["hvm"],
        },
    ],
    owners: ["387983162026"],
});

const internetGw = new aws.ec2.InternetGateway("internetGw", {
    vpcId: vpc.id,
    tags: {
        Name: "createdGateway",
    },
});

const publicRouteTable = new aws.ec2.RouteTable('publicRouteTable', {
    vpcId: vpc.id,
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
    vpcId: vpc.id, // Replace with your VPC ID
    tags: { 
        "Name" : "PrivateRouteTable" 
    },
});


const availabilityZonesMain = aws.getAvailabilityZones({state : 'available'}).then(availableZones => {
    const availabilityZones = availableZones.names.slice(0,3);

    console.log(availabilityZones);
    
    var i=1;
    const publicSubnets = [];
    const privateSubnets = [];
    
    availabilityZones.forEach((az, index) => {
        
        const thirdOctet = index + 1;

        const publicSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${thirdOctet}.0/24`;
        const privateSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${(parseInt(thirdOctet) * 10)}.0/24`;

        console.log(publicSubnetCIDR, privateSubnetCIDR)


        const publicSubnet = new aws.ec2.Subnet(`public-subnet-${az}`, {
            vpcId: vpc.id,
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
            vpcId: vpc.id,
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
    });
    const securityGroup = new aws.ec2.SecurityGroup("my-security-group", {
        description: "My security group",
        vpcId: vpc.id,
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
    const createEC2 = new aws.ec2.Instance("CreateEC2", {
        ami: launchAmi,
        instanceType: "t2.micro",
        vpcSecurityGroupIds: [securityGroup.id],
        vpcId: vpc.id,
        subnetId: publicSubnets[0],
        disableApiTermination: 0,
        volumeSize: 25,
        volumeType: "gp2",
        keyName: keyPair,
        associatePublicIpAddress : 1,
        tags: {
            Name: "dev-iam-1",
        }});

})