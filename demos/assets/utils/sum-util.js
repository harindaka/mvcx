module.exports = function(){
    var self = this;

    this.lazyjs = require('lazy.js');

    this.sum = function(numberArray){
        var totalAge = self.lazyjs(numberArray).reduce(function(aggregate, next){
            return aggregate + next;
        }, 0);

        return totalAge;
    }
};