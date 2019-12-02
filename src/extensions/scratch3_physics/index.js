const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Clone = require('../../util/clone');
const RenderedTarget = require('../../sprites/rendered-target');
const log = require('../../util/log');
const formatMessage = require('format-message');
const MathUtil = require('../../util/math-util');

const decomp = require('poly-decomp');
window.decomp = decomp;
const Matter = require('matter-js');

/*
things to work on:

- offset hull using costume center?
- pushes and spins use force scaled by body's mass
- maybe don't need the enabled flag? just use body is not null?
- update the convex hull when costume changes
- collision hats
- use the sprite center instead of the center of mass for spin and hinge

*/

/**
 * Icon png to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = '';

/**
 * Icon png to be displayed in the blocks category menu, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const menuIconURI = '';

class Scratch3PhysicsBlocks {
    /**
     * Construct a set of physics blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // module aliases
        this.Engine = Matter.Engine;
        this.World = Matter.World;
        this.Bodies = Matter.Bodies;
        this.Body = Matter.Body;
        this.Events = Matter.Events;

        // create an engine
        this.engine = this.Engine.create();

        // gravity is negative because scratch coords (y goes up) are inverted from matter coords (y goes down)
        this.engine.world.gravity.y = -1;

        // scale factor for force applied by push and pushXY blocks
        this.forceScale = 0.001;

        // add the ground and walls to the world
        const wallSize = 1000;
        this.ground = this.Bodies.rectangle(0, -180 - (wallSize / 2), wallSize, wallSize, {isStatic: true});
        this.leftWall = this.Bodies.rectangle(-240 - (wallSize / 2), 0, wallSize, wallSize, {isStatic: true});
        this.rightWall = this.Bodies.rectangle(240 + (wallSize / 2), 0, wallSize, wallSize, {isStatic: true});
        this.topWall = this.Bodies.rectangle(0, 180 + (wallSize / 2), wallSize, wallSize, {isStatic: true});
        this.World.add(this.engine.world, [this.ground, this.leftWall, this.rightWall, this.topWall]);

        // a map of scratch target ids to matter bodies
        this.bodies = new Map();

        // TODO: this requires event triggered hats
        // fire events on collision between any pair of bodies
        this.Events.on(this.engine, 'collisionStart', event => {
            // for each pair, look up each body in this.bodies
            // trigger the collide hat for the target
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                for (const [id, body] of this.bodies) {
                    if ((pair.bodyA.id === body.id) || (pair.bodyB.id === body.id)) {
                        const target = this.runtime.getTargetById(id);
                        this.runtime.startHats('physics_whenCollides', null, target);
                    }
                }
            }
        });

        this.runtime.on('PROJECT_STOP_ALL', this._disableAll.bind(this));
        this.runtime.on('targetWasCreated', this._onTargetCreated.bind(this));

        this.start();
        this.showDebugRenderer();
    }

    /**
     * The key to load & store a target's state related to the physics extension.
     * @type {string}
     */
    static get STATE_KEY () {
        return 'Scratch.physics';
    }

    /**
     * The default physics-related state, to be used when a target has no existing physics state.
     * @type {PhysicsState}
     */
    static get DEFAULT_PHYSICS_STATE () {
        return {
            body: null,
            enabled: false
        };
    }

    /**
     * @param {Target} target - collect physics state for this target.
     * @returns {physicsState} the mutable physics state associated with that target. This will be created if necessary.
     * @private
     */
    _getPhysicsState (target) {
        let physicsState = target.getCustomState(Scratch3PhysicsBlocks.STATE_KEY);
        if (!physicsState) {
            physicsState = Clone.simple(Scratch3PhysicsBlocks.DEFAULT_PHYSICS_STATE);
            target.setCustomState(Scratch3PhysicsBlocks.STATE_KEY, physicsState);
        }
        return physicsState;
    }

    _onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const state = sourceTarget.getCustomState(Scratch3PhysicsBlocks.STATE_KEY);
            if (state && state.enabled) {
                window.setTimeout(() => {
                    const newState = newTarget.getCustomState(Scratch3PhysicsBlocks.STATE_KEY);
                    newState.enabled = true;
                    newState.body = this.enableTarget(newTarget);
                }, 60);
            }
        }
    }

    _disableAll () {
        for (let i = 1; i < this.runtime.targets.length; i++) {
            const target = this.runtime.targets[i];
            const state = this._getPhysicsState(target);
            if (state.enabled) {
                this._disableTarget(target);
            }
            state.enabled = false;
            state.body = null;
        }
        // Matter.World.clear(this.engine.world);
    }

    _disableTarget (target) {
        const state = this._getPhysicsState(target);
        this.World.remove(this.engine.world, state.body);
        this.bodies.delete(state.body.id);
    }

    start () {
        window.requestAnimationFrame(this.step.bind(this));
    }

    step () {
        // for each target, if it has no body, create one
        // for (let i = 1; i < this.runtime.targets.length; i++) {
        //     const target = this.runtime.targets[i];
        //     const state = this._getPhysicsState(target);
        //     if (!state.body && state.enabled) {
        //         this.enableTarget(target);
        //     }
        // }

        for (const [id, body] of this.bodies) {
            const target = this.runtime.getTargetById(id);
            if (target) {
                const state = this._getPhysicsState(target);
                if (!state.enabled) {
                    // remove bodies for targets with physics disabled
                    this.World.remove(this.engine.world, body);
                    this.bodies.delete(id);
                }
            } else {
                // remove any bodies that do not have targets associated with them
                this.World.remove(this.engine.world, body);
                this.bodies.delete(id);
            }
        }

        // If a target has been moved by a drag, or otherwise moved, rotated or scaled,
        // update it in the engine and zero its velocity
        for (let i = 1; i < this.runtime.targets.length; i++) {
            const target = this.runtime.targets[i];
            const state = this._getPhysicsState(target);
            if (!state.enabled) continue;
            const body = state.body;
            // check for position change
            const updatedPos = {x: target.x, y: target.y};
            if ((updatedPos.x !== body.position.x) || (updatedPos.y !== body.position.y)) {
                Matter.Body.setPosition(body, updatedPos);
                Matter.Body.setVelocity(body, {x: 0, y: 0});
                Matter.Body.setAngularVelocity(body, 0);
            }
            // check for rotation change
            let angleDiff = Math.abs(target.direction - this._matterToScratchAngle(body.angle));
            angleDiff %= 360;
            if (angleDiff > 1) {
                Matter.Body.setAngle(body, this._scratchToMatterAngle(target.direction));
                Matter.Body.setAngularVelocity(body, 0);
            }
            // how to do scaling? target.size is a percentage of the original size... so
            // we can't keep re-applying the scale operation...
            // Matter.Body.scale(body, target.size / 100, target.size / 100);

            // todo: update the convex hull if we have changed costume
        }

        // update the physics engine
        this.Engine.update(this.engine, 1000 / 30);

        // update the position and angle of the targets
        for (let i = 1; i < this.runtime.targets.length; i++) {
            const target = this.runtime.targets[i];
            const state = this._getPhysicsState(target);
            if (!state.enabled || !state.body) continue;
            const body = state.body;
            target.setXY(body.position.x, body.position.y);
            target.setDirection(this._matterToScratchAngle(body.angle));
        }
        window.requestAnimationFrame(this.step.bind(this));
    }

    enableTarget (target) {
        const bounds = target.getBounds();
        const width = bounds.right - bounds.left;
        const height = bounds.top - bounds.bottom;
        const options = {
            restitution: 0.8
        };
        const hull = this.runtime.renderer._getConvexHullPointsForDrawable(target.drawableID);
        let body;
        if (hull.length > 0) {
            let vertices = hull.map(p => ({x: p[0], y: p[1] * -1}));
            vertices = Matter.Vertices.hull(vertices);
            body = this.Bodies.fromVertices(target.x, target.y, vertices, options);
            this._setTargetCenterToMatterCenter(target, vertices);
        } else {
            body = this.Bodies.rectangle(target.x, target.y, width, height, options);
        }

        this.World.add(this.engine.world, body);
        this.bodies.set(target.id, body);

        // todo: also remove this listener on disable
        target.addListener(RenderedTarget.EVENT_TARGET_COSTUME_CHANGE, this._updateHull.bind(this));

        return body;
    }

    _updateHull (target) {
        const state = this._getPhysicsState(target);
        if (!state.enabled || !state.body) return;
        const hull = this.runtime.renderer._getConvexHullPointsForDrawable(target.drawableID);
        if (hull.length > 0) {
            let vertices = hull.map(p => ({x: p[0], y: p[1] * -1}));
            vertices = Matter.Vertices.hull(vertices);

            this.World.remove(this.engine.world, state.body);
            this.bodies.delete(state.body.id);

            const options = {
                restitution: 0.8
            };
            state.body = this.Bodies.fromVertices(target.x, target.y, vertices, options);

            this._setTargetCenterToMatterCenter(target, vertices);

            this.World.add(this.engine.world, state.body);
            this.bodies.set(target.id, state.body);
        }
    }

    _setTargetCenterToMatterCenter (target, vertices) {
        const centerOfMass = Matter.Vertices.centre(vertices);
        target.sprite.costumes_[target.currentCostume].rotationCenterX = centerOfMass.x;
        target.sprite.costumes_[target.currentCostume].rotationCenterY = centerOfMass.y * -1;
        // console.log(centerOfMass,target.sprite.costumes_[target.currentCostume].rotationCenterX,
        //     target.sprite.costumes_[target.currentCostume].rotationCenterY);
        // target.offsetX = centerOfMass.x - target.sprite.costumes_[target.currentCostume].rotationCenterX;
        // target.offsetY = centerOfMass.y - (target.sprite.costumes_[target.currentCostume].rotationCenterY * -1);
    }

    _matterToScratchAngle (matterAngleRadians) {
        return (360 - Math.round(MathUtil.radToDeg(matterAngleRadians)) + 90);
    }

    _scratchToMatterAngle (scratchAngleDegrees) {
        return MathUtil.degToRad(90 - scratchAngleDegrees);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'physics',
            name: 'physics',
            blockIconURI: '',
            menuIconURI: '',
            blocks: [
                {
                    opcode: 'onOff',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.enable',
                        default: 'turn physics [ON_OFF] for this sprite',
                        description: ''
                    }),
                    arguments: {
                        ON_OFF: {
                            type: ArgumentType.STRING,
                            menu: 'onOff',
                            defaultValue: 'on'
                        }
                    }
                },
                {
                    opcode: 'whenCollides',
                    text: formatMessage({
                        id: 'physics.whenCollides',
                        default: 'when this sprite collides',
                        description: ''
                    }),
                    blockType: BlockType.HAT
                },
                {
                    opcode: 'push',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.push',
                        default: 'push [FORCE]',
                        description: ''
                    }),
                    arguments: {
                        FORCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'pushXY',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.pushXY',
                        default: 'push x:[X] y:[Y]',
                        description: ''
                    }),
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }

                    }
                },
                {
                    opcode: 'spin',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.spin',
                        default: 'spin clockwise [FORCE]',
                        description: ''
                    }),
                    arguments: {
                        FORCE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'lockToStage',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.lockToStage',
                        default: 'lock to stage',
                        description: ''
                    })
                },
                {
                    opcode: 'hingeToStage',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.hingeToStage',
                        default: 'hinge to stage',
                        description: ''
                    })
                },
                {
                    opcode: 'setGravity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.setGravity',
                        default: 'set gravity to [GRAVITY]',
                        description: ''
                    }),
                    arguments: {
                        GRAVITY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'toggleOutlines',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'physics.toggleOutlines',
                        default: 'toggle outlines',
                        description: ''
                    })
                }
            ],
            menus: {
                onOff: {
                    acceptReporters: false,
                    items: [
                        {text: 'on', value: 'on'},
                        {text: 'off', value: 'off'}
                    ]
                }
            }
        };
    }

    pushXY (args, util) {
        // todo: clamp the force
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        const x = Cast.toNumber(args.X) * state.body.mass * this.forceScale;
        const y = Cast.toNumber(args.Y) * state.body.mass * this.forceScale;
        Matter.Body.applyForce(state.body, state.body.position, {x: x, y: y});
    }

    push (args, util) {
        // todo: clamp the force
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        let force = Cast.toNumber(args.FORCE);
        force = force * state.body.mass * this.forceScale;
        const radians = this._scratchToMatterAngle(util.target.direction);
        const fx = force * Math.cos(radians);
        const fy = force * Math.sin(radians);
        Matter.Body.applyForce(state.body, state.body.position, {x: fx, y: fy});
    }

    spin (args, util) {
        // todo: clamp the force
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        let force = Cast.toNumber(args.FORCE) * state.body.mass * this.forceScale * -1;
        force *= 100;
        state.body.torque = force;
    }

    setGravity (args) {
        // todo: clamp gravity
        const g = -1 * Cast.toNumber(args.GRAVITY) / 100;
        this.engine.world.gravity.y = g;
    }

    getSpeed (args, util) {
        // todo: something odd about this - when gravity is on, speed is 1.1 at rest
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        const speed = state.body.speed;
        const fixed = parseFloat(speed.toFixed(1));
        return fixed;
    }

    lockToStage (args, util) {
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        Matter.Body.setStatic(state.body, true);
    }

    hingeToStage (args, util) {
        const state = this._getPhysicsState(util.target);
        if (!state.enabled || !state.body) return;
        const constraint = Matter.Constraint.create({
            bodyA: state.body,
            pointB: Matter.Vector.clone(state.body.position),
            stiffness: 1,
            length: 0
        });
        this.World.add(this.engine.world, constraint);
    }

    onOff (args, util) {
        const state = this._getPhysicsState(util.target);
        if (args.ON_OFF === 'on') {
            if (!state.enabled) {
                state.enabled = true;
                state.body = this.enableTarget(util.target);
            }
        } else {
            this._disableTarget(util.target);
            state.enabled = false;
            state.body = null;
        }
    }

    whenCollides () {
        return false;
    }

    showDebugRenderer () {
        if (!this.debugRendererShowing) {
            this.debugRendererShowing = true;
            // this has got to be the wrong way to get the stage element...
            let element = document.getElementsByClassName('stage_stage-wrapper_eRRuk')[0];
            element = element.children[0].children[0]; // IDK go away it's fine

            this.render = Matter.Render.create({
                element: element,
                engine: this.engine,
                options: {
                    width: 480,
                    height: 360,
                    showAngleIndicator: false,
                    showCollisions: false,
                    showVelocity: false
                }
            });
            Matter.Render.lookAt(this.render, {
                min: {x: -240, y: -180},
                max: {x: 240, y: 180}
            });

            Matter.Render.run(this.render);

            // try to get it to sit on top of the stage and look right
            this.render.canvas.style.transform = 'scale(1,-1) translate(0px, 360px)';
            this.render.canvas.style.background = '';
            this.render.canvas.style.pointerEvents = 'none';

            this.outlinesVisible = true;
        }
    }
    toggleOutlines () {
        if (this.outlinesVisible) {
            this.render.canvas.style.display = 'none';
            this.outlinesVisible = false;
        } else {
            this.render.canvas.style.display = '';
            this.outlinesVisible = true;
        }
    }
}

module.exports = Scratch3PhysicsBlocks;
