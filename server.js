// Variables

var app = require('express')(),
    bodyParser = require('body-parser'),
    DataStore = require('nedb'),
    fs = require('fs'),
    fse = require('fs-extra'),
    Q = require('q'),
    _ = require('lodash');

// Use middleware

app.use(bodyParser.json());

// Set paths

var paths = {};
paths.dbs = {};
paths.data = {};

// Source data

paths.data.audience = __dirname + '/data/audience.json';
paths.data.subject = __dirname + '/data/subject.json';
paths.data.theme = __dirname + '/data/theme.json';
paths.data.course = __dirname + '/data/course.json';

// Location of databases

paths.dbs.audience = __dirname + '/databases/audience.db';
paths.dbs.subject = __dirname + '/databases/subject.db';
paths.dbs.theme = __dirname + '/databases/theme.db';
paths.dbs.course = __dirname + '/databases/course.db';

// Remove original databases (if they exist)

fse.remove(paths.dbs.audience);
fse.remove(paths.dbs.subject);
fse.remove(paths.dbs.theme);
fse.remove(paths.dbs.course);

// Create databases

var dbs = {};
dbs.audience = new DataStore({filename: paths.dbs.audience, autoload: true}),
    dbs.subject = new DataStore({filename: paths.dbs.subject, autoload: true}),
    dbs.theme = new DataStore({filename: paths.dbs.theme, autoload: true});
dbs.course = new DataStore({filename: paths.dbs.course, autoload: true});

// Okay, let's fill the database!

insertFileToDatabase(paths.data.audience, dbs.audience);
insertFileToDatabase(paths.data.subject, dbs.subject);
insertFileToDatabase(paths.data.theme, dbs.theme);
insertFileToDatabase(paths.data.course, dbs.course);

// API calls

app.get('/course', function (req, res) {

    // Query string

    var qs = req.query;

    // Result object which will be returned

    var result = {
        chosen: {
            audience: null,
            subject: null,
            theme: null
        },
        available: {
            audience: [],
            subject: [],
            theme: []
        },
        courses: []
    };

    // Get courses

    Q.all([
        getCoursesByQueryString(result, qs),
        getChosenFilters(result, qs),

    ]).then(function () {
        getAvailableFilters(result).then(function() {
            res.status(200).json(result);
        });
    });

});

// Start listening

app.listen(1337);


//////////////////////////////////////////////////////////////////////////////////////

// Get available education IDs from result set


function getAvailableFilters(result) {
    var deferred = Q.defer(),
        _audience = [],
        _subject = [],
        _theme = [];

    result.courses.forEach(function (c) {
        _audience = _audience.concat(c.audience);
        _subject = _subject.concat(c.subject);
        _theme = _theme.concat(c.theme);
    });

    _audience = _.uniq(_audience);
    _subject = _.uniq(_subject);
    _theme = _.uniq(_theme);


    Q.all([
        getByFilter('audience', { id: { $in: _audience } }),
        getByFilter('subject', { id: { $in: _subject } }),
        getByFilter('theme', { id: { $in: _theme } })
    ]).then(function(resultSet) {
        resultSet.forEach(function(r) {
            result.available[r.target] = result.available[r.target].concat(r.docs);
        });

        console.log(result.available.audience);
        deferred.resolve(true);
    });

    return deferred.promise;
}

// Get chosen filters

function getChosenFilters(result, qs) {

    var deferred = Q.defer();

    var obj = {
        audience: null,
        subject: null,
        theme: null
    };

    Q.all([
        getValuesById(qs.subject, 'subject', obj),
        getValuesById(qs.audience, 'audience', obj),
        getValuesById(qs.theme, 'theme', obj)
    ]).then(function (results) {
        result.chosen = results;
        deferred.resolve(true);
    });

    return deferred.promise;

}

// Get results

function getCoursesByQueryString(result, qs) {

    var deferred = Q.defer();

    Q.all([
        getCourses(qs, 'subject'),
        getCourses(qs, 'audience'),
        getCourses(qs, 'theme')
    ]).then(function (results) {


        result.courses = _.uniq(_.union.apply(null, results), '_id');
        deferred.resolve(false);
    });

    return deferred.promise;

}

// Get values based on index

function getValuesById(ids, target, result) {

    var deferred = Q.defer(),
        queries = [],
        ids = splitQueryString(ids);

    // create array for Q
    ids.forEach(function (id) {
        queries.push(getValueById(dbs[target], id));
    });

    // promises
    Q.all(queries).then(function (results) {
        result[target] = results;
        deferred.resolve(result);
    });

    return deferred.promise;

}

function getByFilter(target, query) {
    var deferred = Q.defer(),
        query = query || {};

    dbs[target].find(query, function (err, docs) {
        if (err) deferred.reject(err);
        else {
            var o = { target: target, docs: docs };
            deferred.resolve(o);
        }
    });

    return deferred.promise;
}

// Get all items

function get(target, result) {

    var deferred = Q.defer();

    dbs[target].find({}, function (err, docs) {
        if (err) {
            deferred.reject(err);
        } else {
            result[target] = docs;
            deferred.resolve(result);
        }
    });

    return deferred.promise;

}

// Get value based on index

function getValueById(target, id) {

    var deferred = Q.defer();

    target.find({id: id}, function (err, doc) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(doc);
        }
    });

    return deferred.promise;

}

// Get courses matching target

function getCourses(qs, target) {

    var deferred = Q.defer(),
        needle;

    if (!qs[target]) {
        setTimeout(function () {
            deferred.resolve();
        });
        return deferred.promise;
    }

    needle = splitQueryString(qs[target]);

    var query = {};
    query[target] = {$in: needle};

    dbs['course'].find(query, function (err, docs) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(docs);
        }
    });

    return deferred.promise;

};

// Generic method to split query string

function splitQueryString(string, separator) {
    var s = typeof separator !== 'undefined' ? separator : ',',
        split = string.split(s);

    var result = split.map(function (d) {
        return parseInt(d, 10);
    });

    return result;
}

// Generic method to fill the database

function insertFileToDatabase(file, database) {

    // read file and parse to JSON
    var data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // insert file
    database.insert(data, function (err, newEntry) {
        if (err) {
            console.log('Error: ' + err);
        } else {
            return newEntry;
        }
    });

}
