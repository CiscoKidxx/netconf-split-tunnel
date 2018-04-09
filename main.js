const netconf = require('netconf');

const {
  createLogger,
  format,
  transports
} = require('winston');

const {
  combine,
  timestamp,
  label,
  printf
} = format;

const creds = require('./credentials');
const moment = require('moment');
const fs = require('fs');

const myFormat = printf(info => {
  return `${info.timestamp} - ${info.message}`;
});

const logger = createLogger({
  level: 'info',
  transports: new transports.Console({
    format: format.combine(
      format.timestamp({
        format: 'MM/DD/YY HH:mm:ss'
      }),
      myFormat
    )
  })
});

let count = 0;
let begin_script = moment().format("HH:mm:ss");

// Functions for each action:

function openListOfRouters(path) {

  return new Promise((resolve, reject) => {

    logger.info(`[+][Parse CSV] - Opening routers.csv`);
    fs.readFile(path, 'utf8', function(err, data) {
      if (err) {
        logger.error(`[-][Parse CSV] - Cannot find/read routers.csv`)
        reject(err);
      }

      let firstArray = data.split(/\r?\n/);
      let hostArray = firstArray.map(x => {
        let newObj = {
          host: x
        }
        return newObj;
      }) //Be careful if you are in a \r\n world...
      logger.info(`[+][Parse CSV] - Found ${hostArray.length - 1} hosts in routers.csv`);
      resolve(main(hostArray, count));
    })

  })

}

function grabNextHopFromArp(router) {

  logger.info(`[+][Next Hop] - Arping...`)

  return new Promise((resolve, reject) => {

    router.rpc('get-arp-table-information', function(err, result) {

      if (!err) {

        let arpArray = result.rpc_reply.arp_table_information.arp_table_entry;

        // If router only has one arp entry(lab)
        if (!Array.isArray(arpArray)) {

          arpArray = [{
            interface_name: "fe-0/0/2.0",
            ip_address: "7.7.7.7"
          }, {
            interface_name: "fe-0/0/5.0",
            ip_address: "5.5.5.5"
          }]

        }

        let match = arpArray.find(x => {
          return x.interface_name === "fe-0/0/2.0";
        })

        logger.info(`[+][Next Hop] - Found fe-0/0/6 next hop address: ${match.ip_address}`)

        resolve(match.ip_address);

      } else {
        logger.error(err);
        reject(err)
      }

    })

  })

}

function confStaticRoutes(router, next_hop) {
  return new Promise((resolve, reject) => {

    const configData = `
    routing-instances {
        replace: WAN {
            routing-options {
                static {
                    route 104.245.57.0/24 next-hop ${next_hop};
                    route 199.255.120.128/25 next-hop ${next_hop};
                }
            }
        }
    }`

    const options = {
      config: configData,
      action: 'replace',
      format: 'text'
    }

    logger.info(`[+][Static Routes] - Configuring static route towards ${next_hop}.`)

    router.load(options, (err, reply) => {

      if (!err) {
        resolve(reply)
      } else {
        reject(err);
      }
    })
  })
}

function confNatEntries(router) {

  return new Promise((resolve, reject) => {

    const configData = `
    security {
        nat {
            inactive: source {
                rule-set outbound {
                    from interface fe-0/0/5.0;
                    to interface fe-0/0/6.0;
                    replace: rule 1 {
                        match {
                            source-address 0.0.0.0/0;
                            destination-address [ 104.245.57.0/24 199.255.120.128/25 ];
                        }
                        then {
                            source-nat {
                                interface;
                            }
                        }
                    }
                }
            }
        }
    }`

    const options = {
      config: configData,
      action: 'replace',
      format: 'text'
    }

    router.load(options, (err, reply) => {

      if (!err) {

        logger.info(`[+][NAT] - Sending Config.`)
        resolve(reply);

      } else {
        console.log(err);
        reject(err);
      }

    })

  })
}

function commitChanges(router) {

  return new Promise((resolve, reject) => {

    router.commit((err, reply) => {

      if (!err) {
        logger.info(`[+][Commit] - Success.`)
        resolve(reply);
      } else {
        reject(err)
      }

    })
  })
}

function main(hostArray, count) {

  let begin_office = moment().format('HH:mm:ss');

  let routerArray = hostArray
    .filter(Boolean);

  const router = new netconf.Client({
    host: `${routerArray[count].host}`,
    username: creds.username,
    password: creds.password
  })

  logger.info(`[+][Status] - Attempting to SSH into router ${count + 1} - (${routerArray[count].host}).`)

  router.open((err) => {

    if (err) {
      logging.error(`Error logging into router - ${err}`)
      reject(err);
    }

    grabNextHopFromArp(router)
      .then(next_hop => {
        confStaticRoutes(router, next_hop)
          .then(x => {
            confNatEntries(router)
              .then(z => {
                commitChanges(router)
                  .then(y => {
                    let office_done = moment().format('HH:mm:ss')
                    let office_duration = moment.utc(moment(office_done, "HH:mm:ss").diff(moment(begin_office, "HH:mm:ss"))).format("ss")
                    logger.info(`[+][Status] - Router ${count + 1} - ${routerArray[count].host} was successful. Completed in ${office_duration} seconds.`);
                    count++
                    if (count < routerArray.length - 1) {
                      main(hostArray, count);
                    } else {
                      let script_done = moment().format('HH:mm:ss');
                      let script_duration = moment.utc(moment(script_done, "HH:mm:ss").diff(moment(begin_script, "HH:mm:ss"))).format("HH:mm:ss")
                      logger.info(`Completed ${count} routers. Done in ${script_duration}.`)
                    }
                  })
              })
          })

      })

  });

}

// Begin execution
openListOfRouters('./routers.csv')
