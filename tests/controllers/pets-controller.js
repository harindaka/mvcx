module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(model){
    throw new Error('test');

    return self.mvcx.view('index', {
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