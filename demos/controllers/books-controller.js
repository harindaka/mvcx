let controller = function(
  fs
){
  var self = this;
  
  this.fs = fs.dep;  
};

controller.prototype.retrieve = function(model){
  return [
    { bookId: 1, name: 'Harry Potter' },
    { bookId: 2, name: 'Game of Thrones' }
  ];
};

controller.prototype.create = function(model){
  return model;
}

module.exports = controller;
module.exports.$mvcx = { 
  controllerType: 'api'
};
module.exports.$inject = [
  'fs'
];


