const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const gcp = require("@pulumi/gcp");
const fs = require("fs");


const config = new pulumi.Config();
const vpcCIDR = config.require('cidrBlock');
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
const typeOfInstance = config.require('typeOfInstance');
const roleToAdd = config.require('serviceaccountrole');
const serviceaccountIDGCP = config.require('serviceaccountIDGCP');
const BUCKETNAME = config.require('BUCKETNAME');
const bucketlocation = config.require('bucketlocation');
const privateKeyPath = config.require('privateKeyPath');
const snsTopicName = config.require('snsTopicName');
const SMTPUSER = config.require('SMTPUSER');
const SMTPPASSWORD = config.require('SMTPPASSWORD');
const SMTPHOST = config.require('SMTPHOST');
const SENDEREMAIL = config.require('SENDEREMAIL');
const SMTPPORT = config.require('SMTPPORT');
const PROJECTID = config.require('PROJECTID');
const LAMBDAFUNCTIONNAME = config.require('LAMBDAFUNCTIONNAME');
const CCEMAILLIST = config.require('CCEMAILLIST');






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


        const loadBalancerSecGroup = new aws.ec2.SecurityGroup("loadBalancerSecGroup", {
            description: "Security Group for load balancer",
            vpcId: myVPC.id,
            ingress: [
                {
                    protocol: "tcp",
                    fromPort: 80,
                    toPort: 80,
                    cidrBlocks: ["0.0.0.0/0"],
                },
                {
                    protocol: "tcp",
                    fromPort: 443,
                    toPort: 443,
                    cidrBlocks: ["0.0.0.0/0"],
                }
            ],
            egress:[{
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"],
            }],
            tags: 
            {
                Name: "Load balancer Security Group"
            }
        })

        const appSecurityGroup = new aws.ec2.SecurityGroup("my-app-security-group", {
            description: "My security group",
            vpcId: myVPC.id,
            ingress: [{
                fromPort: 22,
                toPort: 22,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                fromPort: 8080,
                toPort: 8080,
                protocol: "tcp",
                securityGroups: [ loadBalancerSecGroup.id ],
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

        const snsAccessForEC2 = new aws.iam.RolePolicyAttachment("SNS ACCESS POLICY", {
            role: ec2Role.name,
            policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
        });

        const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
            role: ec2Role.name,
        });


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

        const topic = new aws.sns.Topic("mytopicfortest", {
            name: snsTopicName
        });



        const userData = pulumi.interpolate`#!/bin/bash\nrm /home/webappuser/webapp/.env\necho "DATABASE_HOST: ${hostname}" >> /home/webappuser/webapp/.env\necho "DATABASE_USER: ${dbUser}" >> /home/webappuser/webapp/.env\necho "DATABASE_PASSWORD: ${dbPasswd}" >> /home/webappuser/webapp/.env\necho "DATABASE_NAME: ${dbName}" >> /home/webappuser/webapp/.env\necho "PORT: ${port}" >> /home/webappuser/webapp/.env\necho "SNSTOPICARN: ${topic.arn}" >> /home/webappuser/webapp/.env\necho "AWSREGION: us-east-1" >> /home/webappuser/webapp/.env\necho "INFRA: AWS" >> /home/webappuser/webapp/.env\nchown webappuser:webappuser /home/webappuser/webapp/.env\nsudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/cloudwatch-config.json\nsudo apt-get install sysstat\nsudo systemctl restart webapp`;

        const base64UserData = userData.apply(data => Buffer.from(data).toString('base64'));

        const webappLaunchTemplate = new aws.ec2.LaunchTemplate("webappLaunchTemplate", {
            imageId: launchAmi ,
            instanceType: typeOfInstance,
            keyName : keyPair,
            vpcId: myVPC.id,
            vpcSecurityGroupIds: [appSecurityGroup.id],
            userData: base64UserData,
            iamInstanceProfile: 
            {
                name: instanceProfile.name,
            },
            tags: 
            {
                Name: "Webapp-Launch-Template",
            }
        });

        const webappLoadBalancer = new aws.lb.LoadBalancer("webappLoadBalancer", {
            internal: false,
            loadBalancerType: "application",
            enableDeletionProtection: false,
            securityGroups: [loadBalancerSecGroup.id],
            subnetMappings : publicSubnets.map(subnetId => ({ subnetId })),
            vpcId: myVPC.id,

        });

        const webappTargetGroup = new aws.lb.TargetGroup("webappTargetGroup", {
            port: 8080,
            protocol: "HTTP",
            target_type: "instance",
            vpcId: myVPC.id,
            healthCheck : {
                enabled: true,
                healthyThreshold: 2,
                interval: 10,
                matcher: "200",
                path: "/healthz/",
                port: 8080,
                protocol: "HTTP",
                timeout: 9,
                unhealthyThreshold:10,
            }
        });

        const loadbalancerListener = new aws.lb.Listener("loadbalancerListener", {
            loadBalancerArn: webappLoadBalancer.arn,
            port: 80,
            protocol: "HTTP",
            defaultActions: [{
                type: "forward",
                targetGroupArn: webappTargetGroup.arn,
            }],
        });

        const webappAutoScaleGroup = new aws.autoscaling.Group("webappAutoScaleGroup", {
            vpcZoneIdentifiers : publicSubnets,
            vpcId: myVPC.id,
            desiredCapacity: 1,
            maxSize: 3,
            minSize: 1,
            defaultCooldown:60,
            healthCheckGracePeriod : 60,
            healthCheckType: "ELB",
            targetGroupArns : [webappTargetGroup.arn],
            launchTemplate: {
                id:webappLaunchTemplate.id, 
                version: webappLaunchTemplate.latestVersion
            },
            loadBalancerNames: [webappLoadBalancer.name]
        });

        const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
            name: "scale-up-policy",
            autoscalingGroupName: webappAutoScaleGroup.name,
            adjustmentType: "ChangeInCapacity",
            scalingAdjustment: 1,
            cooldown: 60, 
            policyType: "SimpleScaling",
            metricAggregationType: "Average",
        });
         
        const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
            name: "scale-down-policy",
            autoscalingGroupName: webappAutoScaleGroup.name,
            adjustmentType: "ChangeInCapacity",
            scalingAdjustment: -1, 
            cooldown: 60, 
            policyType: "SimpleScaling",
            
        });

        const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("scaleUpAlarm", {
            alarmName: "scale_up_alarm",
            alarmDescription: "Scale up when average CPU usage is above 5%",
            comparisonOperator: "GreaterThanOrEqualToThreshold",
            evaluationPeriods: 1,
            metricName: "CPUUtilization",
            namespace: "AWS/EC2",
            period: 60,
            threshold: 5,
            statistic: "Average",
            dimensions: {
                AutoScalingGroupName: webappAutoScaleGroup.name,
            },
            actionsEnabled: true,
            alarmActions: [scaleUpPolicy.arn],
        });
         
        const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("scaleDownAlarm", {
            alarmName: "scale_down_alarm",
            alarmDescription: "Scale down when average CPU usage is below 3%",
            comparisonOperator: "LessThanOrEqualToThreshold",
            evaluationPeriods: 1,
            metricName: "CPUUtilization",
            namespace: "AWS/EC2",
            period: 60,
            threshold: 3,
            statistic: "Average",
            dimensions: {
                AutoScalingGroupName: webappAutoScaleGroup.name,
            },
            actionsEnabled: true,
            alarmActions: [scaleDownPolicy.arn],
        });
        const domainrecord = new aws.route53.Record("domainrecord", {
            zoneId: zoneId,
            name: '',
            type: "A",
            aliases: [{
                name: webappLoadBalancer.dnsName,
                zoneId: webappLoadBalancer.zoneId,
                evaluateTargetHealth: true
            }]
        });

    }
);


const rdsParamterGroup = new aws.rds.ParameterGroup("rdsParameterGroup", {
    name: dbParamterGroup,
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


// const uniqueSuffix = new Date().getTime().toString();

// const uniqueBucketName = pulumi.interpolate`${bucketName}-${uniqueSuffix}`;

// const bucket = new gcp.storage.Bucket("gcpbucket2435", {
//     name: uniqueBucketName,
//     location: bucketlocation,
//     storageClass: "STANDARD",
//     force_destroy: true,
//     publicAccessPrevention: "enforced",
//     versioning: {
//         enabled: true,
//     },
// });

const serviceAccount = new gcp.serviceaccount.Account("my-serviceAccount", {
    accountId: serviceaccountIDGCP,
    displayName: "My New Service Account",
});

// const objectAdminBinding = new gcp.storage.BucketIAMBinding("objectAdminBinding", {
//     bucket: bucket.name,
//     role: roleToAdd,
//     members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
// });

const roles = ["roles/storage.admin"];
 
for (const role of roles) {
    const serviceIAMBinding = new gcp.projects.IAMMember(`myServiceAccountBinding-${role}`, {
        role: role,
        member: serviceAccount.email.apply(email => `serviceAccount:${email}`),
        project: PROJECTID,
    });
}

const serviceAccountKey = new gcp.serviceaccount.Key("my-serviceAccountKey", {
    serviceAccountId: serviceAccount.name,
    privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
});

const topic = new aws.sns.Topic("mytopicfortest1", {
    name: "test-topic2"
});

// const configFile = "./private-key-new2.json";
// const configData = JSON.parse(fs.readFileSync(configFile, "utf8"));

const lambdaRole = new aws.iam.Role("roleForLambda", {
    assumeRolePolicy: pulumi.output({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "lambda.amazonaws.com",
                },
            },
        ],
    }).apply(JSON.stringify),
});

const lambdaRolePolicy = new aws.iam.Policy("my-policy", {
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: "logs:CreateLogGroup",
                Resource: "arn:aws:logs:us-east-1:387983162026:*",
            },
            {
                Effect: "Allow",
                Action: [
                    "logs:CreateLogStream", 
                    "logs:PutLogEvents"
                ],
                Resource: [`arn:aws:logs:us-east-1:387983162026:log-group:/aws/lambda/${LAMBDAFUNCTIONNAME}:*`],
            },
        ],
    },
});

const iamForLambda = new aws.iam.Role("iamForLambda", {assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Sid: "",
        Principal: {
            Service: "lambda.amazonaws.com",
        },
    }],
})});


const lambdaRolePolicyAttachment = new aws.iam.RolePolicyAttachment("lambdaRolePolicyAttachment", {
    role: lambdaRole.name,
    policyArn: lambdaRolePolicy.arn,
});

const lambdafunction = new aws.lambda.Function("TestLambda", {
    name: LAMBDAFUNCTIONNAME,
    code: new pulumi.asset.FileArchive("lambdafunction.zip"),
    handler: "index.handler",
    runtime: "nodejs18.x",
    invokeArn: topic.arn,
    publish: true,
    timeout: 120,
    environment: {
        variables: 
        {
            PRIVATEKEY: serviceAccountKey.privateKey,
            BUCKETNAME: BUCKETNAME,
            SMTPUSER: SMTPUSER,
            SMTPPASSWORD: SMTPPASSWORD,
            SMTPHOST: SMTPHOST,
            SENDEREMAIL: SENDEREMAIL,
            SMTPPORT: SMTPPORT,
            PROJECTID: PROJECTID,
            CCEMAILLIST: CCEMAILLIST,
        }
    },
    role: lambdaRole.arn,
});

const lambdaTriggerPoint = new aws.lambda.Permission("lambdaTriggerFunction", {
    action: "lambda:InvokeFunction",
    "function": lambdafunction.name,
    principal: "sns.amazonaws.com",
    sourceArn: topic.arn, 
});

const lambdaSubscription = new aws.sns.TopicSubscription("lambdaSubscription", {
    protocol: "lambda",
    endpoint: lambdafunction.arn,
    topic : topic.arn
});



exports.vpcId = myVPC.id;
exports.internetGw = internetGw.id;
exports.publicRouteTable=publicRouteTable.id;
exports.privateRouteTable=privateRouteTable.id;
// exports.GCPBUCKETNAME = bucket.name;



// umple soonarcube scitools  understand   state diagrams visual paradigm