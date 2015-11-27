module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(req){
    throw new Error('test');

    return self.view('Index', { pets: [
      { petId: 1, name: 'Good Doge' },
      { petId: 2, name: 'Bad Cate' }
    ]});
  };

  this.post = function(req){
    return { petId: 3, name: 'New Shibe' };
  };
};

module.exports.$type = 'mvc'
module.exports.$inject = [
  'q'
];
