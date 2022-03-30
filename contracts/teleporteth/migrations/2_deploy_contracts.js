const MetaCoin = artifacts.require("TeleportToken");

module.exports = function(deployer) {
  deployer.deploy(MetaCoin);
};
