
export default async ({ Vue }) => {
  Vue.prototype.$erc20Abi = [{
      "inputs": [
          {
              "internalType": "address",
              "name": "tokenOwner",
              "type": "address"
          }
      ],
      "name": "balanceOf",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "balance",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  }, {
      "inputs": [
          {
              "internalType": "string",
              "name": "to",
              "type": "string"
          },
          {
              "internalType": "uint256",
              "name": "tokens",
              "type": "uint256"
          },
          {
              "internalType": "uint256",
              "name": "chainid",
              "type": "uint256"
          }
      ],
      "name": "teleport",
      "outputs": [
          {
              "internalType": "bool",
              "name": "success",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
      {
          "inputs": [
              {
                  "internalType": "bytes",
                  "name": "sigData",
                  "type": "bytes"
              },
              {
                  "internalType": "bytes[]",
                  "name": "signatures",
                  "type": "bytes[]"
              }
          ],
          "name": "claim",
          "outputs": [
              {
                  "internalType": "address",
                  "name": "toAddress",
                  "type": "address"
              }
          ],
          "stateMutability": "nonpayable",
          "type": "function"
      }]


  /*Vue.prototype.$erc20Abi = [
    // Read-Only Functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",

  ];*/
}
