var DataStore = require('nedb'),
    fs = require('fs'),
    Q = require('q');


// Constructor
function Database(name, pathToDbFile) {
    this._name = name;
    this._db = new DataStore({filename: pathToDbFile, autoload: true});
}


// Filter data in the database, use MongoDB querying to filter (find)
Database.prototype.filter = function (query) {
    var deferred = Q.defer(),
        self = this;
    query = query || {};

    this._db.find(query, function (err, docs) {
        if (err) console.log(err, 'database.js line 21');
        if (err) deferred.reject(err);
        else deferred.resolve({target: self._name, docs: docs});
    });
    return deferred.promise;
};


// initialize the database. Call this function in order to
// get a handle to a database object and initialize it with a
// JSON file.
Database.init = function (name, pathToDbFile, pathToJSON) {
    var deferred = Q.defer(),
        pathToDbFile = pathToDbFile || __dirname + '/databases/' + name + '.db',
        pathToJSON = pathToJSON || __dirname + '/data/' + name + '.json',
        db = new Database(name);

    // remove the old database file. If the file does not exist we'll
    // get an error which we can safely ignore.
    require('fs-extra').remove(pathToDbFile, function (err) {

        // load all of the objects described in the JSON document into the
        // newly created database...
        fs.readFile(pathToJSON, 'utf8', function (err, text) {
            var data = JSON.parse(text);
            db._db.insert(data, function (err, insertedData) {
                if (err) deferred.reject(err);
                else deferred.resolve(db);
            });
        });

    });

    return deferred.promise;
};

// export the database.
module.exports = Database;
