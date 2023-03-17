How To
======

Assume Existing Subscription
----------------------------

Have the subscription id ready, it will be needed.

`$sub = '{{guid}}'`

It will also be useful to know the tenant id.

`$tenant = '{{guid}}'`

Create the app registration
---------------------------

This could be one per environment (dev/stage/prod). Display name should be descriptive, but does not have to be unique. (confirm?)

`$applicationRegistrationName = 'MyAppNP'`

`az ad app create --display-name $applicationRegistrationName`

The output of the command contains things we need for later:

- Application ID (json property: appId)
- Object Id (json property: id)

`$applicationId = '{{from json}}'`

`$applicationRegistrationObjectId = '{{from json}}'`

Create Federated Credentials
----------------------------

To permit github to authenticate without having passwords in configuration, we use federated credentials.

Create a `policy.json` file as
```json
{
  "name": "{{MyFederatedCredential}}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:{{github-org}}/{{repo-name}}:ref:refs/heads/{{branch-name}}",
  "audiences": [
    "api://AzureADTokenExchange"
  ]
}
```

- {{MyFederatedCredential}} is the name of credential. Can be simple, like 'MyAppNPFed'
- {{github-org}} is the github org, like 'optum-eeps'
- {{repo-name}} is the name of the repo
- {{branch-name}} is the name of the branch (master, or main usually)

`az ad app federated-credential create --id $applicationRegistrationObjectId --parameters policy.json`

Create a service principal
--------------------------

`az ad sp create --id $applicationId`

We need to determine the role for the principal, as well as the scope of its access. 'Contributor' is a common role. We can isolate the scope to the solution, or to a resource group. Here we use a subscription scope.

`az role assignment create --assignee $applicationId --role Contributor --scope "/subscriptions/$sub" --description "for ci/cd use"`

Github Actions Workflow
-----------------------

Specify:

```yaml
permissions:
  id-token: write
  contents: read
```

Add an az login step after the checkout:

```yaml
- uses: azure/login@v1
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

Repository Secrets
------------------

Set secrets for the repository actions for
- AZURE_CLIENT_ID (from the $applicationId variable above)
- AZURE_TENANT_ID (from the $tenant variable above)
- AZURE_SUBSCRIPTION_ID (from the $sub variable above)

