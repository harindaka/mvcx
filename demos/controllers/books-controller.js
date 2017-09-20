module.exports = function(
  fs
){
  var self = this;

  this.fs = fs.dep;

  this.retrieve = function(model){
    return [
      { bookId: 1, name: 'Harry Potter' },
      { bookId: 2, name: 'Game of Thrones' }
    ];
  };

  this.create = function(model){
    return model;
  }
};

module.exports.$type = 'api'
module.exports.$inject = [
  'fs'
];


