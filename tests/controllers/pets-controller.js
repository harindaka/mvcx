module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(model){

    return self.mvcx.view('index', {
      title: 'My Pets',
      pets: [
        { petId: 1, name: 'Doge', age: 5 },
        { petId: 2, name: 'Cate', age: 6 },
        { petId: 3, name: 'Foxy', age: 7 },
      ]
    });
  };
};

module.exports.$inject = [
  'q'
];
