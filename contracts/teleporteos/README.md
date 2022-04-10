# Install test suite on windows

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
Navigate in the console to the folder teleporteos in which you can install the modules (run the following command again if it fails)
```
yarn install
```
Install and start Docker, open its menu by double clicking the icon in the task bar and go to settings ⚙️.

Check "Use the WSL 2 based engine"

Enable Debian in the settings at Resources / WSL INTEGRATION

Run the tests with the following command in the debian console
```
yarn test 
```