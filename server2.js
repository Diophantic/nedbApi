
// [express](https://www.npmjs.com/package/express)
var express = require('express'),
    app = express(),
    // [lodash](https://www.npmjs.com/package/lodash)
    _ = require('lodash'),
    // [express body-parser](https://www.npmjs.com/package/body-parser)
    bodyParser = require('body-parser'),
    // [database.js](http://localhost:63342/api/docs/database.html)
    Database = require('./database'),
    // [Q](https://www.npmjs.com/package/q)
    Q = require('q'),
    // [CORS](https://www.npmjs.com/package/cors)
    cors = require('cors'),

    separator = ',',

    // [UNUSED]
    // A small helper utillity function which returns
    // the path to a file as seen from the location of
    // this server2.js file
    path = function (_path) {
        return __dirname + _path
    },

    // We'll want to split the query string parameter value according to a separator,
    // this function is used to split the query string.
    splitter = function (str) {
        return str.split(separator || ',').map(function (s) {
            return +s;
        })
    };

// The body parser can be hooked up for each request which comes to the server.
app.use(bodyParser.json());

// Use CORS to allow cross-origin requests
app.use(cors());

// ## Initialize the databases
// Because we do not typically know which search parameters will be
// in the query string. We cannot know which "databases" we will
// need to search for data.
// This is why we set a list of 'search terms' and for each of these
// we get the right database.
var dbs = {};
var items = ['audience', 'theme', 'type', 'course'];
items.forEach(function (item) {
    Database.init(item).then(function (db) {
        dbs[item] = db;
    });
});



// ## EndPoints
// Example:
// [http://localhost:1337/course?audience=1&subject=1&theme=1](http://localhost:1337/course?audience=1&subject=1&theme=1)
app.get('/course', function (req, res) {
    var qs = {},
        result = {
            chosen: {},
            available: {}
        };

    Object.keys(req.query).forEach(function (key) {
        qs[key] = splitter(req.query[key]);
    });

    Q.all([
        getChosenItems(qs, result),
        getCourses(qs, result)
    ]).then(function () {
        getAvailable(qs, result).then(function () {
            res.status(200).json(result);
        });
    });


});


// ## getCourses
// Get all of the courses in the database which comply to the
// query string parameters. We need to keep in mind that the
// query string parameters can vary, so we'll need to check these
// and make every query available as both a database and a key in
// in the search query.
// The way MongoDB works is that we pass in an object which represents
// the filter we'll want to use. This filter logic can handle everything
// from ```and``` and ```or``` and all the other logical operators.
// [MongoDB find](http://docs.mongodb.org/manual/reference/method/db.collection.find/)
//
// Imagine we are looking for courses with:
// ```
// audience=1,2
// theme=1
// ```
// Each course might have a collection audience and theme. The Ids we're searching
// for should be in these collections. If they are all in there we can return that
// as a result.
function getCourses(qs, result) {
    var deferred = Q.defer(),
        query = {},
        subquery = [],
        keys = Object.keys(qs);

    // Create the query, we can have no keys, one key or multiple keys.
    // with zero keys we'll throw an exception. With one key we need need to
    // look for that item and with multiple we'll need a ```and``` query.
    if (keys.length === 1) {
        key = keys[0];

        // Create an AND query
        if(qs[key].length > 1){

            // Loop through each item in the query-string property
            qs[key].forEach(function(k){
                var s = {};
                s[key] = k;
                subquery.push(s);
            });

            query = { $and: subquery };

        // Create an IS query
        } else {
            if(qs[k][0] !== 0) {
                query[key] = qs[key][0];
            }
        }

    } else if (keys.length > 1) {

        keys.forEach(function(k){

            // Create an AND query
            if(qs[k].length > 1){

                // Loop through each item in the query-string property
                qs[k].forEach(function(l){
                    var s = {};
                    s[k] = l;
                    subquery.push(s);
                });

                query = { $and: subquery };

                // Create an IS query
            } else {
                if(qs[k][0] !== 0) {
                    query[k] = qs[k][0];
                }
            }

        });


    } else {
        throw 'error: no keys';
    }

    // Get the items from the database by the query
    dbs.course.filter(query).then(function (courses) {
        result.courses = courses.docs;
        deferred.resolve(true);
    }).catch(function (err) {
        console.log(err);
    });

    return deferred.promise;
}


// ## getChosenItems
// Our query not only produces courses which we've selected through the
// query. We also select the actual items with the query string. This function
// retrieves these items and augments the result object with these ```result.chosen```
// items.
function getChosenItems(qs, result) {
    var deferred = Q.defer();

    // Get the chosen items from the database, we get the right database by key
    // and filter the database objects by query.
    var promises = Object.keys(qs).map(function (key) {
        var query = {id: {$in: qs[key]}};
        return dbs[key].filter(query);
    });

    // Resolve all the promises which we created by looping through the keys
    Q.all(promises).then(function (selectedItems) {

        // for each resolved item we will start to fill the result object
        selectedItems.forEach(function (selectedItem) {
            if (!result.chosen[selectedItem.target])
                result.chosen[selectedItem.target] = selectedItem.docs;
            else
                result.chosen[selectedItem.target] =
                    result.chosen[selectedItem.target].concat(selectedItem.docs);
        });

        // now resolve the promise
        deferred.resolve(true);
    });

    return deferred.promise;
}


// ## getAvailable
// Returns a promise resolving into all of the available courses..
//
// MORE DOCUMENTATION NEEDED. I cannot seem to remember what this function is
// supposed to do...(CK)
function getAvailable(qs, result) {
    var deferred = Q.defer(),
        keys = Object.keys(qs),
        promises = [],
        collector = {
            append: function (key, array) {
                if (!array instanceof Array){
                    throw 'not an array, cannot parse';
                }
                if (!this[key]){
                    this[key] = _.uniq(array);
                } else {
                    this[key] = _.uniq(this[key].concat(array));
                }
            }
        };

    keys.forEach(function (key) {

        result.courses.forEach(function (course) {
            collector.append(key, course[key]);
        });

        if(collector[key]) {
            promises.push(dbs[key].filter({id: {$in: collector[key]}}));
        } else {
            promises.push(dbs[key].filter());
        }

    });

    Q.all(promises).then(function(resultSet) {
        resultSet.forEach(function(_r) {
           result.available[_r.target] = _r.docs;
        });
        deferred.resolve(true);
    });

    return deferred.promise;
}

// Application start listening
app.listen(1338, function () {
    console.log('application listening on http://localhost:1338/');
    var open = require('open');
    if (open) open('http://localhost:1338/course?audience=1&theme=&type=');
});

