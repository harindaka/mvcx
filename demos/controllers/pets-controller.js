var self = null;

let controller = function(
  fs
){
  self = this;  

  //this.fs = fs.dep;
};

controller.prototype.get = function(model, respond){
  
  respond(null, self.mvcx.view('index', {
    title: 'My Pets',
    pets: [
      { petId: 1, name: 'Doge', age: 5 },
      { petId: 2, name: 'Cate', age: 6 },
      { petId: 3, name: 'Foxy', age: 7 },
    ]
  }));
};

module.exports = controller;
module.exports.$inject = [
  'fs'
];
