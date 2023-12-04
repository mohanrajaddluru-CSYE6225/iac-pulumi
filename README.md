# iac-pulumi

Script to create AWS VPC and Subnets

Command to add the SSL Certificate from local to aws account

aws acm import-certificate --certificate <certificate.pem> --certificate-chain <ca_bundle.pem> --private-key <privatekey.pem> --profile --region

example use aws acm import-certificate --certificate file://certificate_base64.txt --certificate-chain file://cabundle_base64.txt --private-key file://private_base64.txt --profile mohan-demo-iam --region us-east-1