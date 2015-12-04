module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(model){
    return self.mvcx.view('Index', {
      title: 'My Pets',
      pets: [
        { petId: 1, name: 'Good Doge' },
        { petId: 2, name: 'Bad Cate' }
      ]
    });
  };
};

module.exports.$type = 'mvc'
module.exports.$inject = [
  'q'
];
