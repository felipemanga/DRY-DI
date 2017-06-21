
module.exports = {bind, inject, getInstanceOf};

/*

Welcome to DRY-DI.

*/


let knownInterfaces = [];
let interfaces = {};
let concretions = {};

let context = [{}];

class Ref {

    constructor( provider, ifid, scope ){
        this.ifid = ifid;
        this.count = provider.dependencyCount;
        this.dependencyCount = provider.dependencyCount;
        this.scope = scope;

        this.binds = {};
        this.injections = null;
        this.provider = provider;

        let pslot = scope[ ifid ] || (scope[ ifid ] = new Slot());

        if( provider.injections ){
            this.injections = {};
            Object.assign( this.injections, provider.injections );

            for( var key in this.injections ){
                let ifid = this.injections[key];
                let slot = scope[ ifid ] || (scope[ifid] = new Slot());
                slot.addInjector( this );
            }
        }

        pslot.addProvider( this );
    }

    bindInjections( injections ){

        injections.forEach(([clazz, _interface]) => {

            var key = knownInterfaces.indexOf( _interface );
            var injection = injections[key];

            if( !(key in this.binds) ){
                let ifid = this.injections[key];
                this.scope[ this.ifid ].removeInjector( this );
                this.satisfy();
                this.dependencyCount--;
            }

            this.binds[key] = clazz;

        });

    }

    satisfy(){

        this.count--;

        if( this.count == 0 )
            this.scope[ this.ifid ].addViable();

    }

}

class Slot{

    constructor(){

        this.viableProviders = 0;
        this.providers = [];
        this.injectors = [];
        
    }

    addInjector( ref ){

        this.injectors.push( ref );
        if( this.viableProviders > 0 )
            ref.satisfy();

    }

    removeInjector( ref ){

        let index = this.injectors.indexOf( ref );
        if( index > -1 )
            this.injectors.splice( index, 1 );

    }

    addProvider( ref ){

        this.providers.push(ref);
        if( ref.count == 0 )
            this.addViable();
        
    }

    addViable(){

        this.viableProviders++;
        if( this.viableProviders == 1 ){

            let injectors = this.injectors;
            for( let i=0, l=injectors.length; i<l; ++i )
                injectors[i].satisfy();

        }

    }

    getViable( clazz, tags, multiple ){

        if( this.viableProviders == 0 ){
            if( !multiple )
                throw new Error("No viable providers for " + clazz + ". #126");
            return [];
        }

        let ret = multiple ? [] : null;
        
        let mostViable = null;
        let maxPoints = -1;
        notViable: for( let i=0, c; c = this.providers[i]; ++i ){
            if( c.count ) continue;
            let points = c.dependencyCount;
            if( tags && c.tags ){
                for( let tag in tags ){
                    if( c.tags[tag] !== tags[tag] ) continue notViable;
                    points++;
                }
            }
            if( multiple )
                ret[ret.length] = c.provider.policy.bind( c.provider, c.binds );
            else{
                if( points > maxPoints ){
                    maxPoints = points;
                    mostViable = c;
                }
            }
        }

        if( !multiple ){
            if( !mostViable )
                throw new Error("No viable providers for " + clazz + ". Tag mismatch.");
            
            return mostViable.provider.policy.bind( mostViable.provider, mostViable.binds );
        }else
            return ret;
    }
}

function registerInterface( ifc ){

    let props = {}, currifc;

    if( typeof ifc == "function" ) currifc = ifc.prototype;
    else if( typeof ifc == "object" ) currifc = ifc;

    while( currifc && currifc !== Object.prototype ){

        let names = Object.getOwnPropertyNames( ifc.prototype );

        for( let i=0, l=names.length; i<l; ++i ){
            let name = names[i];

            if( !props[name] )
                props[name] = typeof ifc.prototype[name];
            
        }

        currifc = currifc.prototype;
    }

    let len = knownInterfaces.length;
    interfaces[ len ] = props;
    knownInterfaces[ len ] = ifc;

    return len;

}


class Provide {

    constructor(){
        this.injections = null;
        this.dependencyCount = 0;
        this.clazz = null;
        this.ctor = null;
        this.binds = null;

        // default policy is to create a new instance for each injection
        this.policy = function( binds, args ){
            return new (this.ctor)( binds, args );
        };
    }

    clone(){

        let ret = new Provide();
        
        ret.injections = this.injections;
        ret.dependencyCount = this.dependencyCount;
        ret.clazz = this.clazz;
        ret.policy = this.policy;
        ret.ctor = this.ctor;
        ret.binds = this.binds;

        return ret;
    }

    bindInjections( injections ){

        var binds = (this.binds = this.binds || []);
        let bindCount = this.binds.length;

        injections.forEach(([clazz, _interface]) => {
            for( var i=0; i<bindCount; ++i ){
                if( binds[i][0] == clazz )
                    return;
            }
            binds[binds.length] = [clazz, _interface];
        });

        return this;

    }

    getRef( ifid, _interface ){

        let map = interfaces[ ifid ], clazz = this.clazz;

        for( let key in map ){
            if( typeof clazz.prototype[key] == map[key] )
                continue;
            throw new Error(`Class ${clazz.name} can't provide to interface ${_interface.name} because ${key} is ` + (typeof clazz[key]) + " instead of " + map[key] + "." );
        }

        return new Ref( this, ifid, context[ context.length - 1 ] );

    }

    setConcretion( clazz ){

        this.clazz = clazz;
        if( typeof clazz == "function" ){
            this.ctor = class extends clazz{
                constructor( binds, args ){ 
                    super( ...args ); 
                }
            };
            // this.ctor.prototype = Object.create(clazz.prototype);
        }else{
            this.policy = () => clazz;
        }
        
        let cid = knownInterfaces.indexOf( clazz );
        if( cid == -1 )
            cid = registerInterface( clazz );
        
        if( !concretions[cid] ) concretions[cid] = [this];
        else concretions[cid].push(this);

        return this;

    }

    factory(){

        this.policy = function( binds, args ){
            var THIS = this;

            return function( ...args2 ){
                return new (THIS.ctor)( binds, args.concat(args2) );
            };

        }

        return this;

    }

    singleton(){

        let instance = null;
        this.policy = function( binds, args ){

            if( instance )
                return instance;

            instance = Object.create(this.ctor.prototype);
            instance.constructor = this.ctor;
            this.ctor.call( instance, binds, args );

            // new (class extends this.ctor{
            //     constructor( args ){
            //         instance = this; // cant do this :(
            //         super(args);
            //     }
            // }

            return instance;

        };

        return this;

    }

}

function bind(clazz){

    let cid = knownInterfaces.indexOf( clazz );
    if( cid == -1 ){
        cid = registerInterface( clazz );
    }
    
    let providers = concretions[cid];
    let localProviders = [];

    if( !providers ){
        
        if( clazz && clazz["@inject"] )
            inject( clazz["@inject"] ).into( clazz );
        else
            (new Provide()).setConcretion(clazz);

        providers = concretions[cid];
    }

    localProviders = providers.map( partial => partial.clone() );
    
    let refs = [];
    let tags = null;
    let ifid;

    let partialBind = {
        to:function( _interface ){

            let ifid = knownInterfaces.indexOf( _interface );
            if( ifid == -1 )
                ifid = registerInterface( _interface );

            localProviders.forEach((provider) => {

                let ref = provider.getRef( ifid, _interface );
                ref.tags = tags;
                refs.push( ref );

            });

            return this;

        },

        withTags:function( tags ){
            refs.forEach( ref => ref.tags = tags );
            return this;
        },

        singleton:function(){
            localProviders.forEach( provider => provider.singleton() );
            return this;
        },
        factory:function(){
            localProviders.forEach( provider => provider.factory() );
            return this;
        },
        inject:function( map ){
            return this.injecting( map );
        },
        injecting:function( ...args ){
            refs.forEach( ref => ref.bindInjections(args) );
            localProviders.forEach( provider => provider.bindInjections(args) );
            return this;
        }

    }
    
    return partialBind;
}

class Inject{
    constructor(dependencies){
        this.dependencies = dependencies;
        var tags = this.tags = {};
        for( var key in dependencies ){
            tags[key] = {};
        }
    }

    into( clazz ){

        let cid = knownInterfaces.indexOf( clazz );
        if( cid == -1 )
            cid = registerInterface( clazz );
        
        let injections = {}, 
            map = this.dependencies, 
            dependencyCount = 0, 
            tags = this.tags,
            multiple = {};

        for( let key in map ){

            var _interface =  map[key]
            var dependency = _interface;
            if( Array.isArray(dependency) ){

                _interface = _interface[0];
                for( let i=1; i<dependency.length; ++i ){

                    if( typeof dependency[i] == "string" )
                        tags[key][dependency[i]] = true;
                    else if( Array.isArray(dependency[i]) )
                        multiple[key] = true;
                    else if( dependency[i] )
                        Object.assign( tags[key], dependency[i] );

                }

            }

            let ifid = knownInterfaces.indexOf( _interface );

            if( ifid == -1 )
                ifid = registerInterface( _interface );
            
            injections[key] = ifid;

            dependencyCount++;

        }

        let provider = (new Provide()).setConcretion( clazz ), proto = clazz.prototype;
        let providers = concretions[cid];

        provider.injections = injections;        
        provider.dependencyCount = dependencyCount;

        provider.ctor = function( binds, args ){
            resolveDependencies( binds, this );
            clazz.apply( this, args );
        };
        provider.ctor.prototype = Object.create( clazz.prototype );
        provider.ctor.prototype.constructor = clazz;

        // provider.ctor = class extends clazz {
        //     constructor( args ){
        //         resolveDependencies( this ); // *sigh*
        //         super(...args);
        //     }
        // };

        function resolveDependencies( binds, obj ){
            let slotset =  context[ context.length-1 ];
            for( let key in injections ){
                if( binds && injections[key] in binds ){
                    obj[key] = binds[ injections[key] ];
                    continue;
                }
                
                let slot = slotset[ injections[key] ];
                let policy = slot.getViable( key, tags[key], multiple[key] );
                if( !multiple[key] )
                    obj[key] = policy([]);
                else{
                    let out = obj[key] = [];
                    for( let i=0; i<policy.length; ++i )
                        out[i] = policy[i]([]);
                }
            }
        }
    }
}

function inject( dependencies ){

    return new Inject( dependencies );

}

function getInstanceOf( _interface, ...args ){

    let ifid = knownInterfaces.indexOf( _interface );
    let slot = context[ context.length-1 ][ ifid ];

    if( !slot )
        throw new Error("No providers for " + (_interface.name || _interface) + ". #467");
    
    let policy = slot.getViable();
    
    return policy.call( null, args );

}


