"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

module.exports = { bind: bind, inject: inject, getInstanceOf: getInstanceOf };

/*

Welcome to DRY-DI.

*/

var knownInterfaces = [];
var interfaces = {};
var concretions = {};

var context = [{}];

var Ref = function () {
    function Ref(provider, ifid, scope) {
        _classCallCheck(this, Ref);

        this.provider = provider;
        this.ifid = ifid;
        this.count = provider.dependencyCount;
        this.scope = scope;

        var pslot = scope[ifid] || (scope[ifid] = new Slot());

        if (provider.injections) {
            for (var key in provider.injections) {

                var _ifid = provider.injections[key];

                var slot = scope[_ifid] || (scope[_ifid] = new Slot());
                slot.addInjector(this);
            }
        }

        pslot.addProvider(this);
    }

    _createClass(Ref, [{
        key: "satisfy",
        value: function satisfy() {

            this.count--;

            if (this.count == 0) this.scope[this.ifid].addViable();
        }
    }]);

    return Ref;
}();

var Slot = function () {
    function Slot() {
        _classCallCheck(this, Slot);

        this.viableProviders = 0;
        this.providers = [];
        this.injectors = [];
    }

    _createClass(Slot, [{
        key: "addInjector",
        value: function addInjector(ref) {

            this.injectors.push(ref);
            if (this.viableProviders > 0) ref.satisfy();
        }
    }, {
        key: "addProvider",
        value: function addProvider(ref) {

            this.providers.push(ref);
            if (ref.count == 0) this.addViable();
        }
    }, {
        key: "addViable",
        value: function addViable() {

            this.viableProviders++;
            if (this.viableProviders == 1) {

                var injectors = this.injectors;
                for (var i = 0, l = injectors.length; i < l; ++i) {
                    injectors[i].satisfy();
                }
            }
        }
    }, {
        key: "getViable",
        value: function getViable(clazz) {

            if (this.viableProviders == 0) throw new Error("No viable providers for " + clazz);

            for (var i = 0, c; c = this.providers[i]; ++i) {
                if (!c.count) return c.provider;
            }
        }
    }]);

    return Slot;
}();

function registerInterface(ifc) {

    var props = {},
        currifc = void 0;

    if (typeof ifc == "function") currifc = ifc.prototype;else if ((typeof ifc === "undefined" ? "undefined" : _typeof(ifc)) == "object") currifc = ifc;

    while (currifc && currifc !== Object.prototype) {

        var names = Object.getOwnPropertyNames(ifc.prototype);

        for (var i = 0, l = names.length; i < l; ++i) {
            var name = names[i];

            if (!props[name]) props[name] = _typeof(ifc.prototype[name]);
        }

        currifc = currifc.prototype;
    }

    var len = knownInterfaces.length;
    interfaces[len] = props;
    knownInterfaces[len] = ifc;

    return len;
}

var Provide = function () {
    function Provide() {
        _classCallCheck(this, Provide);

        this.injections = null;
        this.dependencyCount = 0;
        this.clazz = null;

        this.policy = function (args) {
            return new this.ctor(args);
        };
    }

    // default policy is to create a new instance for each injection


    _createClass(Provide, [{
        key: "getRef",
        value: function getRef(_interface) {

            var ifid = knownInterfaces.indexOf(_interface);
            if (ifid == -1) ifid = registerInterface(_interface);

            var map = interfaces[ifid],
                clazz = this.clazz;

            for (var key in map) {
                if (_typeof(clazz.prototype[key]) == map[key]) continue;
                throw new Error("Class " + clazz.name + " can't provide to interface " + _interface.name + " because " + key + " is " + _typeof(clazz[key]) + " instead of " + map[key] + ".");
            }

            return new Ref(this, ifid, context[context.length - 1]);
        }
    }, {
        key: "setConcretion",
        value: function setConcretion(clazz) {

            this.clazz = clazz;
            if (typeof clazz == "function") {
                this.ctor = function (args) {
                    clazz.apply(this, args);
                };
                this.ctor.prototype = Object.create(clazz.prototype);
            } else {
                this.policty = function () {
                    return clazz;
                };
            }

            var cid = knownInterfaces.indexOf(clazz);
            if (cid == -1) cid = registerInterface(clazz);

            if (!concretions[cid]) concretions[cid] = [this];else concretions[cid].push(this);

            return this;
        }
    }, {
        key: "factory",
        value: function factory() {

            this.policy = function () {

                return function (args) {
                    return new this.ctor(args);
                };
            };

            return this;
        }
    }, {
        key: "singleton",
        value: function singleton() {

            var instance = null;
            this.policy = function (args) {

                if (instance) return instance;

                instance = Object.create(this.clazz.prototype);

                this.ctor.call(instance, args);

                return instance;
            };

            return this;
        }
    }]);

    return Provide;
}();

function bind(clazz) {

    var cid = knownInterfaces.indexOf(clazz);
    if (cid == -1) cid = registerInterface(clazz);

    var providers = concretions[cid];
    if (!providers) {
        var provider = new Provide().setConcretion(clazz);
        providers = concretions[cid];
    }

    var partialBind = {
        to: function to(_interface) {
            for (var i = 0, l = providers.length; i < l; ++i) {
                var _provider = providers[i];
                _provider.getRef(_interface); // ref indexes itself
            }
            return this;
        },
        singleton: function singleton() {
            for (var i = 0, l = providers.length; i < l; ++i) {
                providers[i].singleton();
            }
            return this;
        },
        factory: function factory() {
            for (var i = 0, l = providers.length; i < l; ++i) {
                providers[i].factory();
            }
            return this;
        }
    };

    return partialBind;
}

var Inject = function () {
    function Inject(dependencies) {
        _classCallCheck(this, Inject);

        this.dependencies = dependencies;
    }

    _createClass(Inject, [{
        key: "into",
        value: function into(clazz) {

            var cid = knownInterfaces.indexOf(clazz);
            if (cid == -1) cid = registerInterface(clazz);

            var injections = {},
                map = this.dependencies,
                dependencyCount = 0;

            for (var key in map) {

                var ifid = knownInterfaces.indexOf(map[key]);

                if (ifid == -1) ifid = registerInterface(map[key]);

                injections[key] = ifid;

                dependencyCount++;
            }

            var provider = new Provide().setConcretion(clazz),
                proto = clazz.prototype;
            var providers = concretions[cid];

            provider.injections = injections;
            provider.dependencyCount = dependencyCount;

            provider.ctor = function (args) {
                resolveDependencies(this);
                clazz.apply(this, args);
            };

            provider.ctor.prototype = proto;

            function resolveDependencies(obj) {
                var slotset = context[context.length - 1];
                for (var _key in injections) {
                    var slot = slotset[injections[_key]];
                    var _provider2 = slot.getViable(_key);
                    obj[_key] = _provider2.policy([]);
                }
            }
        }
    }]);

    return Inject;
}();

function inject(dependencies) {
    return new Inject(dependencies);
}

function getInstanceOf(_interface) {

    var ifid = knownInterfaces.indexOf(_interface);
    var slot = context[context.length - 1][ifid];

    if (!slot) throw new Error("No viable providers for " + _interface.name);

    var provider = slot.getViable();

    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key2 = 1; _key2 < _len; _key2++) {
        args[_key2 - 1] = arguments[_key2];
    }

    return provider.policy.call(provider, args);
}