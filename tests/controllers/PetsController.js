module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(req){
    return self.mvcx.view('Index', { pets: [
      { petId: 1, name: 'Good Doge' },
      { petId: 2, name: 'Bad Cate' }
    ]});
  };
};

module.exports.$type = 'mvc'
module.exports.$inject = [
  'q'
];
