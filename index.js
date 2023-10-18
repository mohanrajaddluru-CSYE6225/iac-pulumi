const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');

const config = new pulumi.Config();

var vpcCIDR = config.require('cidrBlock');
const publicCidrBlock = config.require('publicCidrBlock');
const launchAmi = config.require('launchAMIID');
const tags = config.getObject('tags');


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

// const devIamKeyPair = aws.ec2.getKeyPair({
//     keyName: "dev-iam",
//     includePublicKey: true,

// });


//import * as pulumi from "@pulumi/pulumi";
//import * as aws from "@pulumi/aws";

//const deployer = new aws.ec2.KeyPair("deployer", {publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD3F6tyPEFEzV0LX3X8BsXdMsQz1x2cEikKDEY0aIj41qgxMCP/iteneqXSIFZBp5vizPvaoIR3Um9xK7PGoW8giupGn+EPuxIA4cDM4vzOqOkiMPhz5XK0whEjkVzTo4+S0puvDZuwIsdiW9mxhJc7tgBNL0cYlWSYVkz4G/fslNfRPW5mYAM49f4fhtxPb5ok4Q2Lg9dPKVHO/Bgeu5woMc7RY0p1ej6D4CKFE6lymSDJpW0YHX/wqE9+cfEauh7xZcG0q9t2ta6F6fmX0agvpFyZo8aFbXeUBr7osSCJNgvavWbM/06niWrOvYX2xwWdhXmXSrbX8ZbabVohBK41 email@example.com"});


const localKeypair = new aws.ec2.KeyPair("dev-iam-keypair", {
    publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDO4DrIzF95EOvApm62fE6stieemA8Kh3txdVLWav+HZ1v7eiha5tnKCjCvzGGYJVYTOp5V8xJlZCnQFBXdSt5kqBNKRwgtWHq9zqgt7a9kWBxHIhSoOC9rT9ytRDO5Oz9MJTvNW1+Z13ZpUMLcyM8z6p1clVDbsK2VQFaWMmqnTdxxhcVdEF5smcW6zmY1fC9AXs5vryyJRbe5pPdXmQtNSVaZ0qSNu5ALdLHgvgArY6528OMu1HE1UFmIB1zVMQLZ5XFDZSZoAKwoOrCUurcfKxhBLOBghqyvklyJURQ3fOvlJHzHA9LMCGtmtx8ge85iOWhGP8H3WfkIeQPtlbJ3azwBfRM0WIJOt0vsIV4bzFraXoEZyks9YXmHiYlOVAJkwXL0p6wXLcvnQSKSdgMKHbgvX6hrMQrAp83yUEDg6a7TdGILKWD4GRpzi4lokEFA8DHNxt9LfHoHHUpWJ0XOBl7Z4iPj6hGt9IZXG2GrMQ7FFuVs9yHECSTPUKAI6F8= mohanrajaddluru@Mohans-MacBook-Air.local"
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
        keyName: "development",
        associatePublicIpAddress : 1,
        tags: {
            Name: "dev-iam-1",
        }});

})