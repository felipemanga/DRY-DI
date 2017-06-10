
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

    getViable( clazz ){

        if( this.viableProviders == 0 )
            throw new Error("No viable providers for " + clazz);
        
        for( let i=0, c; c = this.providers[i]; ++i ){
            if( !c.count )
                return c.provider;
        }
        
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

    injections = null;
    dependencyCount = 0;
    clazz = null;

    // default policy is to create a new instance for each injection
    policy = function( args ){
        return new this.ctor(args);
    };

    getRef( _interface ){

        let ifid = knownInterfaces.indexOf( _interface );
        if( ifid == -1 )
            ifid = registerInterface( _interface );

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
            this.ctor = function( args ){ clazz.apply( this, args ); };
            this.ctor.prototype = Object.create(clazz.prototype);
        }else{
            this.policty = () => clazz;
        }
        
        let cid = knownInterfaces.indexOf( clazz );
        if( cid == -1 )
            cid = registerInterface( clazz );
        
        if( !concretions[cid] ) concretions[cid] = [this];
        else concretions[cid].push(this);            

        return this;

    }

    factory(){

        this.policy = function(){

            return function( args ){
                return new this.ctor(args);
            };

        }

        return this;

    }

    singleton(){

        let instance = null;
        this.policy = function( args ){

            if( instance )
                return instance;

            instance = Object.create( this.clazz.prototype );

            return this.ctor.call( instance, args );

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

    let partialBind = {
        to:function( _interface ){
            for( let i=0, l=providers.length; i<l; ++i ){
                let provider = providers[i];
                provider.getRef( _interface ); // ref indexes itself
            }
            return this;
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
    }

    into( clazz ){

        let cid = knownInterfaces.indexOf( clazz );
        if( cid == -1 )
            cid = registerInterface( clazz );
        
        let injections = {}, map = this.dependencies;

        for( let key in map ){

            let ifid = knownInterfaces.indexOf( map[key] );

            if( ifid == -1 )
                ifid = registerInterface( map[key] );
            
            injections[key] = ifid;

            this.dependencyCount++;

        }

        let provider = (new Provide()).setConcretion( clazz ), proto = clazz.prototype;
        let providers = concretions[cid];
        

        provider.ctor = function( args ){
            resolveDependencies( this );
            clazz.apply( this, args );
        };

        provider.ctor.prototype = proto;

        function resolveDependencies( obj ){
            let slotset =  context[ context.length-1 ];
            for( let key in injections ){
                let slot = slotset[ injections[key] ];
                let provider = slot.getViable( key );
                obj[key] = provider.policy([]);
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


