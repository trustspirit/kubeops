import type { ResourceTemplate } from '@/stores/template-store';

export const builtInTemplates: ResourceTemplate[] = [
  {
    id: 'builtin-deployment',
    name: 'Deployment',
    description: 'A standard Kubernetes Deployment with configurable replicas and container image.',
    resourceType: 'deployments',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
  namespace: {{namespace}}
  labels:
    app: {{name}}
spec:
  replicas: {{replicas}}
  selector:
    matchLabels:
      app: {{name}}
  template:
    metadata:
      labels:
        app: {{name}}
    spec:
      containers:
        - name: {{name}}
          image: {{image}}
          ports:
            - containerPort: {{port}}
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi`,
    variables: [
      { name: 'name', description: 'Name of the deployment' },
      { name: 'namespace', defaultValue: 'default', description: 'Target namespace' },
      { name: 'replicas', defaultValue: '3', description: 'Number of replicas' },
      { name: 'image', defaultValue: 'nginx:latest', description: 'Container image' },
      { name: 'port', defaultValue: '80', description: 'Container port' },
    ],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'builtin-service',
    name: 'Service',
    description: 'A ClusterIP Service exposing a set of pods by label selector.',
    resourceType: 'services',
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: {{name}}
  namespace: {{namespace}}
spec:
  type: {{serviceType}}
  selector:
    app: {{appSelector}}
  ports:
    - protocol: TCP
      port: {{port}}
      targetPort: {{targetPort}}`,
    variables: [
      { name: 'name', description: 'Name of the service' },
      { name: 'namespace', defaultValue: 'default', description: 'Target namespace' },
      { name: 'serviceType', defaultValue: 'ClusterIP', description: 'Service type (ClusterIP, NodePort, LoadBalancer)' },
      { name: 'appSelector', description: 'Label selector for target pods' },
      { name: 'port', defaultValue: '80', description: 'Service port' },
      { name: 'targetPort', defaultValue: '80', description: 'Target container port' },
    ],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'builtin-configmap',
    name: 'ConfigMap',
    description: 'A ConfigMap for storing non-confidential configuration data.',
    resourceType: 'configmaps',
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{name}}
  namespace: {{namespace}}
data:
  {{key}}: {{value}}`,
    variables: [
      { name: 'name', description: 'Name of the ConfigMap' },
      { name: 'namespace', defaultValue: 'default', description: 'Target namespace' },
      { name: 'key', defaultValue: 'config.yaml', description: 'Data key name' },
      { name: 'value', defaultValue: '', description: 'Data value' },
    ],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'builtin-cronjob',
    name: 'CronJob',
    description: 'A CronJob that runs a container on a schedule.',
    resourceType: 'cronjobs',
    yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{name}}
  namespace: {{namespace}}
spec:
  schedule: "{{schedule}}"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: {{name}}
              image: {{image}}
              command:
                - /bin/sh
                - -c
                - {{command}}
          restartPolicy: OnFailure`,
    variables: [
      { name: 'name', description: 'Name of the CronJob' },
      { name: 'namespace', defaultValue: 'default', description: 'Target namespace' },
      { name: 'schedule', defaultValue: '0 * * * *', description: 'Cron schedule expression' },
      { name: 'image', defaultValue: 'busybox:latest', description: 'Container image' },
      { name: 'command', defaultValue: 'echo hello', description: 'Command to run' },
    ],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'builtin-ingress',
    name: 'Ingress',
    description: 'An Ingress resource for HTTP routing to backend services.',
    resourceType: 'ingresses',
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{name}}
  namespace: {{namespace}}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: {{ingressClass}}
  rules:
    - host: {{host}}
      http:
        paths:
          - path: {{path}}
            pathType: Prefix
            backend:
              service:
                name: {{serviceName}}
                port:
                  number: {{port}}`,
    variables: [
      { name: 'name', description: 'Name of the Ingress' },
      { name: 'namespace', defaultValue: 'default', description: 'Target namespace' },
      { name: 'ingressClass', defaultValue: 'nginx', description: 'Ingress class name' },
      { name: 'host', defaultValue: 'example.com', description: 'Hostname for the ingress rule' },
      { name: 'path', defaultValue: '/', description: 'URL path prefix' },
      { name: 'serviceName', description: 'Backend service name' },
      { name: 'port', defaultValue: '80', description: 'Backend service port' },
    ],
    builtIn: true,
    createdAt: 0,
  },
];
