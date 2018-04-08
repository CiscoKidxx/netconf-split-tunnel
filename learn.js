const ping = require('ping');
const Netmask = require('netmask').Netmask

let gateways = [];


let getHosts = (network) => {

  return new Promise((resolve, reject) => {

    let block = new Netmask(network);

    let gateway = block.first;

    gateways.push(gateway);

    if (!block.first.includes('.255.')) {
      getHosts(block.next() + '/24')
    }

    resolve(gateways);

  })

}

let isHostAlive = (hosts) => {

  return new Promise(async (resolve, reject) => {

    let aliveHosts = [];

    for (let host of hosts) {

      await ping.promise.probe(host, {
          extra: ["-n 3"]
        })
        .then(res => {
          if (res.alive) {
            console.log(res);
            aliveHosts.push(res.host);
          }
        })
    }

    resolve(aliveHosts);
  })
}

getHosts('10.51.0.0/24')
  .then(res => {
    isHostAlive(res)
  })

// isHostAlive()
//   .then(aliveHosts => {
//     console.log(aliveHosts.length);
//   })
//   .catch(err => {
//     console.log(err);
//   })
