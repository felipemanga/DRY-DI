# DRY-DI
DRY-DI: ES5/6* Dependency Injection where you Don't Repeat Yourself. 

- Works in the Browser or in NodeJS!
- Now with 100% more Interfaces!
- Duck-Type verification!
- No dependencies!
- MIT License!

## TL;DR

The following example requires Babel and transform-class-properties.

    class InterfaceType {
        method(){ throw "Not Implemented!"; }
    }

    class B {
        method(){ console.log("B.method()"); }
    }

    class A {
        static "@inject" = {
            injectedProperty: InterfaceType
        }
        otherMethod(){
            this.injectedProperty.method();
        }
    }

    bind(B).to(InterfaceType);
    bind(A).to("name").singleton();
    getInstance("name").otherMethod();

## INSTALL

    npm install --save dry-di

    You should also install Babel, as ES6 has some limitations.


## Yet another DI container?!

Well, I was annoyed by 3 things in other DI libraries:
- Dependency on larger frameworks and/or TypeScript.
- Verbose and/or hard-to-read code.
- Verbose and/or hard-to-read code.

So I wrote a tiny little framework where you write code like this:

    // get the dry-di functions
    let {bind, inject, getInstanceOf} = require('dry-di')

    // create an IFood class to serve as an Interface
    class IFood{
        eat(){ throw "Interface" };
    }

    // Doritos may not really be food (does not extend IFood). 
    // But it sure does look like food... so good enough.
    class Doritos{
        eat(){
            console.log("eating doritos");
        }
    }

    // Create a Mouth for the eating of IFood.
    class Mouth{
        constructor(){
            
            console.log("creating mouth");
            
            // food is an injected property.
            this.food.eat(); 

        }

        again(){
            console.log("eating some more...");
            this.food.eat();
        }
    }

    // Mouths require things that look like IFood.
    // IFood-like things go in the "food" property.
    inject({ food:IFood }).into( Mouth ); 

    // register Doritos as a kind of IFood.
    bind(Doritos).to(IFood);

    // register Mouth as a singleton called "main".
    bind(Mouth).to("main").singleton(); 

    // Create a Mouth
    // Create Doritos
    // Inject doritos into mouth.
    // Call the Mouth constructor.
    // Return mouth
    let mouth = getInstanceOf("main"); // HERE BE MAGIC!         
    
    // Mouth is a singleton, so don't create a new one.
    // Just get the previous one, instead.
    // Then eat some more!
    getInstanceOf("main").again();  

Properties are automatically injected before the constructor is called. This feature isn't possible in ES6, however, so you must use a transpiler to convert it to ES5. On the other hand, that means you don't need to do this common pattern all over the place:

    class A {
        dependency1:IPropertyType;
        dependency2:IPropertyType;
        dependency3:IPropertyType;
        constructor( 
                dependency1:IPropertyType, 
                dependency2:IPropertyType, 
                dependency3:IPropertyType 
            ){
            this.dependency1 = dependency1;
            this.dependency2 = dependency2;
            this.dependency3 = dependency3;
        }
    }

When you have lots of classes with lots of dependencies, this gets old fast.

If you're using Babel for transpiling, you can make use of the "transform-class-properties" plugin to put your injections inside the class:

    class Cabbage extends IFood {

        static "@inject" = {
            color:"IColor"
        };

        eat(){
            console.log("eating " + this.color + " cabbage");
        }

    }

## Injection Tags
It is possible to use tags for disambiguation. In the following example, Doritos will get injected into the Mouth as food, but not as healthyFood.

    // Mouths require things that look like IFood.
    // IFood-like things go in the "food" property.
    inject({ 
        food:IFood, // inject IFood, regardless of tags
        healthyFood:[IFood, {healthy:true}], // inject IFood tagged healthy
    }).into( Mouth ); 

    // register Doritos as a kind of IFood.
    bind(Doritos).to(IFood);

    // register Cabbage as healthy IFood.
    bind(Cabbage).to(IFood).withTags({ healthy:true });

It is also possible to inject arrays of things with the syntax:

```inject({foods:[ IFood,[] ]}).into( Mouth ); // inject all foods```

Of course, this can be used together with tags and/or static properties:

``` static "@inject" = { foods:[ IFood,[], {tasty:true}] }; // inject all tasty foods```

## Strings as Interfaces & Explicit Injection Binding
Also visible in the example is that you can use names instead of interface classes.
This allows you to do things like instancing classes from HTML or defining variations of a class:

    // Believe it or not, Cabbage actually is food!
    class Cabbage extends IFood {

        static "@inject" = {
            color:"IColor"
        };

        eat(){
            console.log("eating " + this.color + " cabbage");
        }
    }

    bind(Cabbage).to("PurpleCabbage").injecting( ["purple", "IColor"] );
    bind(Cabbage).to("GreenCabbage").injecting( ["green", "IColor"] );

Here, two variants of Cabbage are defined, with different injections for the IColor type. This can be combined with tags for diferenciation or used with array injection, if you need all the different types of cabbage.
