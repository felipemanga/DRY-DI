
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
        this.provider = provider;
        this.ifid = ifid;
        this.count = provider.dependencyCount;
        this.scope = scope;

        let pslot = scope[ ifid ] || (scope[ ifid ] = new Slot());

        if( provider.injections ){
            for( var key in provider.injections ){

                let ifid = provider.injections[key];

                let slot = scope[ ifid ] || (scope[ifid] = new Slot());
                slot.addInjector( this );

            }
        }

        pslot.addProvider( this );

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
                throw new Error("No viable providers for " + clazz);
            return [];
        }

        let ret = multiple ? [] : null;
        
        let mostViable = null;
        let maxPoints = -1;
        notViable: for( let i=0, c; c = this.providers[i]; ++i ){
            if( c.count ) continue;
            let points = c.provider.dependencyCount;
            if( tags && c.tags ){
                for( let tag in tags ){
                    if( c.tags[tag] !== tags[tag] ) continue notViable;
                    points++;
                }
            }
            if( multiple )
                ret[ret.length] = c.provider;
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
            
            return mostViable.provider;
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

        // default policy is to create a new instance for each injection
        this.policy = function( args ){
            return new (this.ctor)(args);
        };
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
                constructor( args ){ 
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

        this.policy = function( args ){

            return function( ...args2 ){
                return new this.ctor( args.concat(args2) );
            };

        }

        return this;

    }

    singleton(){

        let instance = null;
        this.policy = function( args ){

            if( instance )
                return instance;

            instance = Object.create(this.ctor.prototype);
            instance.constructor = this.ctor;
            this.ctor.call( instance, args );

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
    if( cid == -1 )
        cid = registerInterface( clazz );
    
    let providers = concretions[cid];
    if( !providers ){
        let provider = (new Provide()).setConcretion(clazz);
        providers = concretions[cid];
    }

    let refs = [];
    let tags = null;
    let ifid;

    let partialBind = {
        to:function( _interface ){
            let ifid = knownInterfaces.indexOf( _interface );
            if( ifid == -1 )
                ifid = registerInterface( _interface );

            for( let i=0, l=providers.length; i<l; ++i ){
                let provider = providers[i];
                let ref = provider.getRef( ifid, _interface );
                ref.tags = tags;
                refs.push( ref );
            }

            return this;
        },

        withTags:function( tags ){
            refs.forEach( ref => ref.tags = tags );
        },

        singleton:function(){
            for( let i=0, l=providers.length; i<l; ++i ){
                providers[i].singleton();
            }
            return this;
        },
        factory:function(){
            for( let i=0, l=providers.length; i<l; ++i ){
                providers[i].factory();
            }
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

        provider.ctor = function( args ){
            resolveDependencies( this );
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

        function resolveDependencies( obj ){
            let slotset =  context[ context.length-1 ];
            for( let key in injections ){
                let slot = slotset[ injections[key] ];
                let provider = slot.getViable( key, tags[key], multiple[key] );
                if( !multiple[key] )
                    obj[key] = provider.policy([]);
                else{
                    let out = obj[key] = [];
                    for( let i=0; i<provider.length; ++i )
                        out[i] = provider[i].policy([]);
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
        throw new Error("No viable providers for " + _interface.name);
    
    let provider = slot.getViable();
    
    return provider.policy.call( provider, args );
}


