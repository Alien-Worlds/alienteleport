# New features
- Optional fix and variable fees which fund the oracles
- Freeze options for specific parts of the contract
- Adjustable amount of needed oracle confirmations for a receiving teleport
- Adjustable minimum amount for deposits and teleports 
- Option to delete old teleport and cancel entries without losing consensus 

# Deployment and initialization

1. Deploy the contract
2. Run the ini action of the contract with the following parameters
```
ACTION ini(asset min, uint64_t fixfee, double varfee, bool freeze, uint32_t threshold);
```
- ***min*** Minimum amount for a deposit and teleport
- ***fixfee*** Fix fee for teleports and receipts. Together with the variable fee (varfee) the resulting fee has to be less than minimum transfer amount (min).
- ***varfee*** Variable fee for teleports and receipts. This has to be between 0 and 0.20 which equals to 0% and 20%.
- ***freeze*** True to freeze the contract until you unfreeze it with the freeze action.
- ***threshold*** Amount of needed oracle confirmations for a receiving teleport

With the freeze action you can freeze and unfreeze specific parts of the contract
```
ACTION freeze(const bool in, const bool out, const bool oracles, const bool cancel);
```
- ***in*** True to freeze incoming funds, false to unfreeze 
- ***out*** True to freeze outgoing funds, false to unfreeze
- ***oracles*** True to freeze oracles, false to unfreeze
- ***cancel*** True to freeze cancel action, false to unfreeze

## Upgrade from running teleport contract of alien world

Just deploy the contract over the old teleport contract account and run the ini action.
Note: In this upgrade are additional tables, the structure of the old tables is not changed.

# Install test suite on windows

You need to activate the windows feature Hyper-V, but it is not available on Windows 10 Home. So you might need to upgrade your Windows to Windows Pro.

## Activate WSL 2
Start windows PowerShell as administrator and run the following commands
```
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

```
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

```
wsl --set-default-version 2
```

## Set up Linux environment
Install Debian from Microsoft store, start it, create your user account and run the following commands
```
sudo apt-get update
```
```
sudo apt-get upgrade
```
For yarn installation via npm
```
sudo apt-get install npm
```
Install yarn globally
```
sudo npm install --global yarn
```
Navigate in the console to the folder teleporteos in which you can install the modules (**run the following command again if it fails**)
```
sudo yarn install
```

## Set up docker
Install and start Docker, check for updates and install them. Open Dockers menu by double clicking the icon in the task bar and go to settings ⚙️.

Check "Use the WSL 2 based engine"

Enable Debian in the settings at Resources / WSL INTEGRATION

## Run tests

Docker must be running. Start the tests with the following command in the debian console
```
sudo yarn test 
```