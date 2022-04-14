# Install test suite on windows

You need to activate the windows feature Hyper-V, but it is not available on Windows 10 Home. SO you might need to upgrade your Windows to Windows Pro.

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

## Set up linux environment
Install Debian from microsoft store, start it, create your user account and run the following commands
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

## Usage

Run the tests with the following command in the debian console
```
sudo yarn test 
```