const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const neo4j = require('neo4j-driver').v1;
const neo_creds = require('./constants.js').neo_creds;
const parser = require('concepts-parser');
const unfluff = require('unfluff');
const blacklist = require('./blacklist.json');

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

const concept_extract = text => {
  text = unfluff(text).text;

  let concept_dict = {};
  let all_concepts = [];
  let average = 0;
  let sum = 0;

  let concepts = parser.parse({text: text, lang: 'en'});
  for(let con of concepts) {
    let concept = con.value.toLowerCase();
    if(concept.indexOf('.') < 0 && blacklist.indexOf(concept) < 0) {
      if(concept_dict[concept])
        concept_dict[concept] += 1;
      else
        concept_dict[concept] = 1;

      average += 1;
    }
  }

  let count = concepts.length;
  average = average / count;

  for(let concept in concept_dict) {
     sum += (concept_dict[concept] - average) * (concept_dict[concept] - average);
  }
  let stdev = Math.sqrt(sum / count);

  for(let concept in concept_dict) {
     if(concept_dict[concept] < average + (1 * stdev))
      delete concept_dict[concept];
  }

  return concept_dict;
}

app.post('/site_visit', (req, res) => {
  let transactions = [];
  let concept_transactions = [];
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
    .then(result => axios.get(current.url))
    .then(result => {
      let concepts = concept_extract(result.data);

      for(let concept in concepts) {
        concept_transactions.push(`
          MATCH (s: Site {url: "${current.url}", time: ${current.time}})
          MERGE (c: Concept {id: "${concept}"})
          MERGE (s)-[:HAS_CONCEPT]->(c)
        `);
      }
      return postToNeo(concept_transactions);
    })
    .then(result => transactions[0])
    .catch(console.log);

});

const server = app.listen(3000, '0.0.0.0', () => {
  console.log('node listening at http://', server.address().address, server.address().port);
})
