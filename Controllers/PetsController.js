module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.get = function(req){
    return [
      { petId: 1, name: 'Good Doge' },
      { petId: 2, name: 'Bad Cate' }
    ];
  };

  this.post = function(req){
    return { petId: 3, name: 'New Shibe' };
  };
};

module.exports.$inject = [
  'q'
];
