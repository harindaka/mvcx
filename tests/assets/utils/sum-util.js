module.exports = function(){
    this.lazyjs = require('lazy.js');

    this.sum = function(numberArray){
        return lazyjs(numberArray).reduce(function(aggregate, next){
            return aggregate + next;
        }, 0);
    }
};