const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const neo4j = require('neo4j-driver').v1;
const neo_creds = require('./constants.js').neo_creds;

const driver = neo4j.driver("bolt://54.213.194.217:7687", neo4j.auth.basic(neo_creds.username, neo_creds.password));
const session = driver.session();

const app = express();

app.use(bodyParser.urlencoded({extended: false, limit: '50mb'}));
app.use(bodyParser.json({limit: '50mb'}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const postToNeo = transactions => {
  let tx = session.beginTransaction();
  for(let trans of transactions) {
    tx.run(trans).catch(console.log);
  }
  return tx.commit().catch(console.log);
};

app.post('/site_visit', (req, res) => {
  let transactions = [];
  let previous = req.body.previous;
  let current = req.body.current;

  if(previous) {
    transactions.push(`
      MATCH (s1: Site {url: "${previous.url}", time: ${previous.time}})
      MERGE (s2: Site {url: "${current.url}", time: ${current.time}})
      MERGE (s1)-[:NEXT]->(s2)
    `);
  }
  else {
    transactions.push(`
       MERGE (s: Site {url: "${current.url}", time: ${current.time}})
    `);
  }


  return postToNeo(transactions)
    .then(res => transactions[0])
    .catch(err => console.log(err));

});

const server = app.listen(3000, '0.0.0.0', () => {
  console.log('node listening at http://', server.address().address, server.address().port);
})
