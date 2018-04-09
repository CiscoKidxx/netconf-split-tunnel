const ping = require('ping');
const Netmask = require('netmask').Netmask

let count = 0;
let aliveHosts = [];
let promises = [];

// Scan every .1 in the 10.50.0.1/24 - 10.54.255.1/24 range and report back which are alive.
let getHosts = (network) => {

  let block = new Netmask(network);

  let host = block.first;

  // Push all promises to an array to be resolved once all are synchronously fulfilled.
  promises.push(ping.promise.probe(host))

  if (count < 5) {
    count++;

    // Recursivly execute with the next subnet's .1 address
    getHosts(block.next() + '/24')

  } else {

    // Resolve all promises and push hosts that responded to a new array.
    Promise.all(promises)
      .then(res => {

        res.forEach(host => {

          if (host.alive) {
            aliveHosts.push(host.host);
          }

        })
        // Call next function with new array of hosts.
        queryRouterForDetails(aliveHosts);
      })
  }
}

// Query alive routers for hostname, fe-0/0/6 IP address and fe-0/0/6 next hop IP address.
let queryRouterForDetails = (hostsArray) => {
  console.log(hostsArray);

  // Do things here...

}

getHosts('10.50.0.0/24')



// isHostAlive()
//   .then(aliveHosts => {
//     console.log(aliveHosts.length);
//   })
//   .catch(err => {
//     console.log(err);
//   })
