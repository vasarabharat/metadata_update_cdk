import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Aws } from 'aws-cdk-lib';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MetadataUpdateCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC');

    const cfnComputeEnvironment = new batch.CfnComputeEnvironment(this, 'MyCfnComputeEnvironment', {
      type: 'MANAGED',

      // the properties below are optional
      computeEnvironmentName: 'metadata-update-compute-env-cdk',
      computeResources: {
        minvCpus: 0,
        maxvCpus: 256,
        subnets: ['subnet-020fea197b7f24011','subnet-0e08dcb71a111bafd', 'subnet-051f616d1286c7444', 'subnet-09c3b927cf3e25498', 'subnet-03c7b4bb41b3c277a', 'subnet-0cb2813b48d924a39'
      ],  // are we creating new subnet for this service !
        type: 'EC2',

        // the properties below are optional
        allocationStrategy: 'BEST_FIT',
        bidPercentage: 100,
        desiredvCpus: 0,

        ec2Configuration: [{
          imageType: 'ECS_AL2',      
        }],

        instanceRole: 'arn:aws:iam::388531472195:instance-profile/ecsInstanceRole', // used existing
        instanceTypes: ['m5.xlarge'],
        

        placementGroup: 'placementGroup',

        securityGroupIds: ['sg-005715bdf2efbbef3'],

        spotIamFleetRole: 'spotIamFleetRole',
      },

      replaceComputeEnvironment: false,
      serviceRole: 'arn:aws:iam::388531472195:role/aws-service-role/batch.amazonaws.com/AWSServiceRoleForBatch',  // used existing service role!!
      state: 'ENABLED',
      
      updatePolicy: {
        jobExecutionTimeoutMinutes: 240,
        terminateJobsOnUpdate: false,
      },
    });


    const cfnJobDefinition = new batch.CfnJobDefinition(this, 'MyCfnJobDefinition', {
      type: 'container',
      // the properties below are optional
      containerProperties: {
        image: '388531472195.dkr.ecr.eu-central-1.amazonaws.com/metadata-update-redis:latest',  // image to execute on job

        // the properties below are optional
        executionRoleArn: 'arn:aws:iam::388531472195:role/sidBatchJobRole', // used existing role

        jobRoleArn: 'arn:aws:iam::388531472195:role/sidBatchJobRole', // used existing role

        resourceRequirements: [{
          type: 'VCPU',
          value: '3',
        },
        {
          type: 'MEMORY',
          value: '20480',
        }],
      },

      jobDefinitionName: 'metadata-update-job-definition-cdk',

      platformCapabilities: ['EC2'],
      schedulingPriority: 1,
      timeout: {
        attemptDurationSeconds: 240,
      },
    });
    cfnJobDefinition.addDependency(cfnComputeEnvironment)


    const cfnJobQueue = new batch.CfnJobQueue(this, 'MyCfnJobQueue', {
      computeEnvironmentOrder: [{
        computeEnvironment: cfnComputeEnvironment.attrComputeEnvironmentArn,
        order: 0,
      }],
      priority: 1,

      // the properties below are optional
      jobQueueName: 'metadata-update-job-queue-cdk',
      state: 'ENABLED',
    });
    cfnJobQueue.addDependency(cfnComputeEnvironment)
    cfnJobQueue.addDependency(cfnJobDefinition)
    

    const rule = new events.Rule(this, 'metadata-update-rule', {
      description: 'Schedule a job to run once a week every Sunday 13:30',
      schedule: events.Schedule.cron({ minute: '30', hour: '13', weekDay: 'SUN' }),
    });

    const jobDefinitionArnSuffix = cfnJobDefinition.jobDefinitionName;
    const jobDefinitionArn = `arn:aws:batch:${Aws.REGION}:${Aws.ACCOUNT_ID}:job-definition/${jobDefinitionArnSuffix}`;

    rule.addTarget(new targets.BatchJob( cfnJobQueue.attrJobQueueArn, cfnJobQueue, jobDefinitionArn,
      cfnJobDefinition, {
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(2),
      }));
  }
}
