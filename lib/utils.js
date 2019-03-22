'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var path = require('path');

exports.PscError = function (_Error) {
  _inherits(PscError, _Error);

  function PscError(message, modules) {
    _classCallCheck(this, PscError);

    var _this = _possibleConstructorReturn(this, (PscError.__proto__ || Object.getPrototypeOf(PscError)).call(this, message));

    _this.modules = modules;
    _this.isPscError = true;
    return _this;
  }

  _createClass(PscError, null, [{
    key: 'name',
    get: function get() {
      return 'PscError';
    }
  }]);

  return PscError;
}(Error);

var repeat = function repeat(value, times) {
  return times <= 0 ? [] : [value].concat(_toConsumableArray(repeat(value, times - 1)));
};
var diffPursModuleNames = function diffPursModuleNames(from, target, parts) {
  if (!from.length) return parts.concat(target);
  if (!target.length) return parts.concat(repeat('..', from.length));

  var _from = _toArray(from),
      head_from = _from[0],
      tail_from = _from.slice(1);

  var _target = _toArray(target),
      head_target = _target[0],
      tail_target = _target.slice(1);

  return head_from === head_target ? diffPursModuleNames(tail_from, tail_target, parts) : parts.concat(repeat('..', from.length), target);
};

var normalizeRewriteRuleDest = function normalizeRewriteRuleDest(_ref) {
  var dest = _ref.dest,
      moduleName = _ref.moduleName;
  return typeof dest === 'function' ? dest(moduleName) : dest;
};
var rewrite = function rewrite(_ref2) {
  var rules = _ref2.rules,
      moduleName = _ref2.moduleName;

  var moduleNameParts = moduleName.split('.');
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = Object.entries(rules)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _step$value = _slicedToArray(_step.value, 2),
          rule = _step$value[0],
          dest = _step$value[1];

      var ruleParts = rule.split('.');
      var matched = ruleParts.every(function (part, i) {
        return part === '*' || part === moduleNameParts[i];
      });
      if (!matched) continue;
      var rest = moduleNameParts.slice(ruleParts.length);
      var base = normalizeRewriteRuleDest({ dest: dest, moduleName: moduleName });
      return path.join.apply(path, [base].concat(_toConsumableArray(rest))) + '.purs';
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }
};

exports.resolvePursModule = function (_ref3) {
  var baseModulePath = _ref3.baseModulePath,
      baseModuleName = _ref3.baseModuleName,
      rewriteRules = _ref3.rewriteRules,
      targetModuleName = _ref3.targetModuleName;

  var rewrittenModulePath = rewrite({ rules: rewriteRules, moduleName: targetModuleName });
  if (rewrittenModulePath) return rewrittenModulePath;
  var parts = diffPursModuleNames(baseModuleName.split('.'), targetModuleName.split('.'), []);
  return parts.length ? path.resolve(baseModulePath, path.join.apply(path, _toConsumableArray(parts)) + '.purs') : baseModulePath;
};

exports.resolveForeignModule = function (pursModulePath) {
  return path.join(path.dirname(pursModulePath), path.basename(pursModulePath, path.extname(pursModulePath)) + '.js');
};