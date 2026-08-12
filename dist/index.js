// src/physics.ts
var PHYSICS_CONTACT_EPSILON = 0.000000001;
var PHYSICS_CONTACT_SLOP = 0.05;
var PHYSICS_CONTACT_PERCENT = 0.2;
var MAX_CONTACT_SOLVER_ITERATIONS = 16;
var CCD_MAX_STEP_SIZE = 4;
var MAX_CCD_SUBSTEPS = 16;
var MAX_COLLISION_IMPULSE = 50;
function isPhysicsParticipant(entity) {
  return !entity.isDead() && entity.physicsEnabled();
}
function isFiniteVector(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}
function validatePhysicsBody(body) {
  if (!isFiniteVector(body.position)) {
    throw new Error(`Invalid physics body: non-finite position (${body.position.x}, ${body.position.y})`);
  }
  if (!isFiniteVector(body.velocity)) {
    throw new Error(`Invalid physics body: non-finite velocity (${body.velocity.x}, ${body.velocity.y})`);
  }
  if (!Number.isFinite(body.bounds.x) || !Number.isFinite(body.bounds.y) || body.bounds.x < 0 || body.bounds.y < 0) {
    throw new Error(`Invalid physics body: bounds must be finite and non-negative, got (${body.bounds.x}, ${body.bounds.y})`);
  }
  if (body.shape === 0 /* CIRCLE */ && body.bounds.x <= 0) {
    throw new Error(`Invalid physics body: a circle needs a positive radius, got ${body.bounds.x}`);
  }
  if (body.mass !== Infinity && (!Number.isFinite(body.mass) || body.mass <= 0)) {
    throw new Error(`Invalid physics body: mass must be positive or Infinity, got ${body.mass}`);
  }
  if (body.bounceFactor !== Infinity && (!Number.isFinite(body.bounceFactor) || body.bounceFactor < 0 || body.bounceFactor > 1)) {
    throw new Error(`Invalid physics body: bounce factor must be within [0, 1] or Infinity, got ${body.bounceFactor}`);
  }
}
function forwardVectorFromRotation(rotation) {
  const radians = rotation * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
function isStructureCollisionRole(value) {
  return value === "solid" || value === "containment" || value === "both";
}
var SHAPE;
((SHAPE2) => {
  SHAPE2[SHAPE2["CIRCLE"] = 0] = "CIRCLE";
  SHAPE2[SHAPE2["LINE"] = 1] = "LINE";
  SHAPE2[SHAPE2["RECTANGLE"] = 2] = "RECTANGLE";
})(SHAPE ||= {});
function getShapeName(input) {
  switch (input) {
    case 0 /* CIRCLE */:
      return "circle";
    case 2 /* RECTANGLE */:
      return "rectangle";
    case 1 /* LINE */:
      return "line";
    default:
      return "TODO";
  }
}
// node_modules/@coffeemakerstudio/roast/dist/index.js
function assertJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (Number.isFinite(value))
      return;
    throw new Error("System settings must contain finite JSON numbers");
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonValue);
    return;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value))
      assertJsonValue(child);
    return;
  }
  throw new Error("System settings must contain JSON data only");
}

class EngineSystemRegistry {
  definitions = new Map;
  executors = new Map;
  register(definition, executor) {
    validateDefinition(definition);
    if (this.definitions.has(definition.id))
      throw new Error(`Duplicate system definition '${definition.id}'`);
    this.definitions.set(definition.id, clone(definition));
    if (executor)
      this.executors.set(definition.id, executor);
    return this;
  }
  getDefinition(id) {
    const definition = this.definitions.get(id);
    if (!definition)
      throw new Error(`Unknown system '${id}'`);
    return clone(definition);
  }
  getExecutor(id) {
    return this.executors.get(id);
  }
  select(ids) {
    const selected = new Set;
    const add = (id) => {
      if (selected.has(id))
        return;
      const definition = this.definitions.get(id);
      if (!definition)
        throw new Error(`Unknown system '${id}'`);
      selected.add(id);
      for (const capability of definition.requires ?? []) {
        const providers = [...this.definitions.values()].filter((candidate) => provides(candidate, capability));
        const active = providers.filter((candidate) => selected.has(candidate.id));
        if (active.length === 1)
          continue;
        if (active.length > 1 || providers.length !== 1)
          throw new Error(`System '${id}' requires exactly one provider for '${capability}'`);
        add(providers[0].id);
      }
    };
    ids.forEach(add);
    validateReplacements([...selected].map((id) => this.definitions.get(id)));
    const order = topologicalOrder([...selected].map((id) => this.definitions.get(id)));
    return {
      schemaVersion: 1,
      systems: order.map((definition) => ({ systemId: definition.id, schemaVersion: definition.schemaVersion ?? 1, state: clone(definition.state ?? {}) })).sort((a, b) => a.systemId.localeCompare(b.systemId)),
      systemOrder: order.map((definition) => definition.id)
    };
  }
  validate(settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new Error("Malformed framework settings");
    const value = settings;
    if (value.schemaVersion !== 1 || !Array.isArray(value.systems) || !Array.isArray(value.systemOrder))
      throw new Error("Malformed framework settings");
    const ids = new Set;
    for (const system of value.systems) {
      if (!system || typeof system.systemId !== "string" || system.schemaVersion !== 1 || !system.state || typeof system.state !== "object" || Array.isArray(system.state))
        throw new Error("Malformed system settings");
      if (!this.definitions.has(system.systemId) || ids.has(system.systemId))
        throw new Error(`Unknown or duplicate system '${system.systemId}'`);
      assertJsonValue(system.state);
      ids.add(system.systemId);
    }
    if (value.systemOrder.length !== ids.size || new Set(value.systemOrder).size !== ids.size || value.systemOrder.some((id) => !ids.has(id)))
      throw new Error("Invalid framework system order");
    const expected = this.select(value.systemOrder).systemOrder;
    if (expected.join("|") !== value.systemOrder.join("|"))
      throw new Error("Framework system order violates dependencies");
  }
  validateEffectSupport(settings, effects, catalog) {
    this.validate(settings);
    const selected = new Set(settings.systemOrder);
    const definitions = [...selected].map((id) => this.definitions.get(id));
    for (const effect of effects) {
      catalog.validate(effect);
      const typed = effect;
      const definition = catalog.get(typed.type);
      const accepted = definitions.some((candidate) => candidate.acceptsEffects?.includes(typed.type) === true);
      if (!accepted)
        throw new Error(`No selected system accepts effect '${typed.type}'`);
      for (const capability of definition.requiresCapability ?? []) {
        if (!definitions.some((candidate) => provides(candidate, capability)))
          throw new Error(`Effect '${typed.type}' requires missing capability '${capability}'`);
      }
    }
  }
}
function validateDefinition(definition) {
  if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id))
    throw new Error("Invalid system definition ID");
  if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1)
    throw new Error("Unsupported system definition version");
  for (const list of [definition.provides, definition.requires, definition.before, definition.after, definition.replaces, definition.requiresCapabilities]) {
    if (list !== undefined && (!Array.isArray(list) || list.some((value) => typeof value !== "string" || value.length === 0)))
      throw new Error(`Invalid system definition '${definition.id}'`);
  }
  if (definition.acceptsEffects !== undefined && (!Array.isArray(definition.acceptsEffects) || definition.acceptsEffects.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid accepted Effects for '${definition.id}'`);
  if (definition.requiresCapabilities !== undefined && (!Array.isArray(definition.requiresCapabilities) || definition.requiresCapabilities.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid required capabilities for '${definition.id}'`);
  assertJsonValue(definition.state ?? {});
}
function provides(definition, capability) {
  return definition.id === capability || definition.provides?.includes(capability) === true;
}
function validateReplacements(definitions) {
  for (const definition of definitions) {
    for (const capability of definition.replaces ?? []) {
      const conflicts = definitions.filter((candidate) => candidate.id !== definition.id && provides(candidate, capability) && !definition.replaces?.includes(capability) && !(definition.replaces?.includes(candidate.id) || candidate.replaces?.includes(definition.id)));
      if (conflicts.length > 0)
        throw new Error(`System '${definition.id}' conflicts with '${conflicts[0].id}' for '${capability}'`);
    }
  }
  const capabilities = new Set(definitions.flatMap((definition) => [definition.id, ...definition.provides ?? []]));
  for (const capability of capabilities) {
    const providers = definitions.filter((definition) => provides(definition, capability));
    if (providers.length > 1 && !providers.some((definition) => definition.replaces?.includes(capability)))
      throw new Error(`Multiple selected providers for '${capability}'`);
  }
}
function topologicalOrder(definitions) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const edges = new Map(definitions.map((definition) => [definition.id, new Set]));
  for (const definition of definitions) {
    for (const dependency of definition.after ?? [])
      if (byId.has(dependency))
        edges.get(dependency).add(definition.id);
    for (const dependency of definition.before ?? [])
      if (byId.has(dependency))
        edges.get(definition.id).add(dependency);
    for (const capability of definition.requires ?? []) {
      const provider = definitions.find((candidate) => candidate.id !== definition.id && provides(candidate, capability));
      if (provider)
        edges.get(provider.id).add(definition.id);
    }
  }
  const incoming = new Map(definitions.map((definition) => [definition.id, 0]));
  for (const targets of edges.values())
    for (const target of targets)
      incoming.set(target, incoming.get(target) + 1);
  const available = definitions.filter((definition) => incoming.get(definition.id) === 0).map((definition) => definition.id).sort();
  const result = [];
  while (available.length) {
    const id = available.shift();
    result.push(byId.get(id));
    for (const target of edges.get(id)) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) {
        available.push(target);
        available.sort();
      }
    }
  }
  if (result.length !== definitions.length)
    throw new Error("System dependencies contain a cycle");
  return result;
}
function clone(value) {
  return structuredClone(value);
}
var COUNTER_SCHEMA_VERSION = 1;
function createCounterState(input) {
  const state = {
    schemaVersion: COUNTER_SCHEMA_VERSION,
    id: input.id,
    value: input.value ?? 0
  };
  validateCounterState(state);
  return state;
}
function validateCounterState(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !["schemaVersion", "id", "value"].includes(key)) || Object.keys(value).length !== 3) {
    throw new Error("Malformed counter state");
  }
  if (value.schemaVersion !== COUNTER_SCHEMA_VERSION)
    throw new Error("Unsupported counter state schema version");
  if (typeof value.id !== "string" || value.id.length === 0)
    throw new Error("Counter state requires a non-empty id");
  if (typeof value.value !== "number" || !Number.isFinite(value.value))
    throw new Error("Counter state value must be finite");
}
function canonicalizeCounterStates(value) {
  if (!Array.isArray(value))
    throw new Error("Counter states must be an array");
  const counters = value.map((counter) => {
    validateCounterState(counter);
    return { ...counter };
  });
  if (new Set(counters.map((counter) => counter.id)).size !== counters.length)
    throw new Error("Counter state IDs must be unique");
  return counters.sort((a, b) => a.id.localeCompare(b.id));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class RuntimeEntity {
  id;
  capabilities;
  components;
  constructor(value) {
    if (!isRecord2(value) || typeof value.id !== "string" || !Array.isArray(value.capabilities)) {
      throw new Error("Runtime entities require an id and capabilities");
    }
    this.id = value.id;
    this.capabilities = [...value.capabilities].filter((capability) => typeof capability === "string");
    this.components = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "capabilities"));
  }
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  getComponent(capability) {
    return this.components[capability];
  }
}

class EngineRuntime {
  entities;
  order;
  executors;
  constructor(settings, registry) {
    if (!settings.framework)
      throw new Error("A runtime requires a selected framework");
    registry.validate(settings.framework);
    this.entities = settings.entities.map((entity) => new RuntimeEntity(entity)).sort((a, b) => a.id.localeCompare(b.id));
    this.order = [...settings.framework.systemOrder];
    this.executors = this.order.map((id) => registry.getExecutor(id)).filter((executor) => Boolean(executor));
  }
  tick(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative");
    const entities = this.entities;
    const context = {
      deltaSeconds,
      entities,
      query: (required) => entities.filter((entity) => required.every((capability) => entity.hasCapability(capability)))
    };
    for (const executor of this.executors)
      executor(context);
  }
  getEntity(id) {
    return this.entities.find((entity) => entity.id === id);
  }
  getEntities() {
    return this.entities;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class EngineWorldBuilder {
  id;
  worldSize;
  entities = [];
  structures = [];
  effects = [];
  counters = [];
  background;
  framework;
  constructor(id, worldSize) {
    this.id = id;
    this.worldSize = worldSize;
    if (!id || !isPositiveVector(worldSize))
      throw new Error("A world requires an ID and positive finite worldSize");
  }
  setBackground(background) {
    assertJsonValue(background);
    this.background = clone2(background);
    return this;
  }
  addEntity(entity) {
    assertJsonValue(entity);
    this.entities.push(clone2(entity));
    return this;
  }
  addStructure(structure) {
    assertJsonValue(structure);
    this.structures.push(clone2(structure));
    return this;
  }
  addEffect(effect) {
    assertJsonValue(effect);
    this.effects.push(clone2(effect));
    return this;
  }
  addCounter(counter) {
    this.counters.push(...canonicalizeCounterStates([counter]));
    return this;
  }
  useFramework(framework) {
    this.framework = clone2(framework);
    return this;
  }
  build() {
    return { schemaVersion: 1, id: this.id, worldSize: clone2(this.worldSize), ...this.background === undefined ? {} : { background: clone2(this.background) }, entities: clone2(this.entities), structures: clone2(this.structures), effects: clone2(this.effects), counters: canonicalizeCounterStates(this.counters), ...this.framework ? { framework: clone2(this.framework) } : {} };
  }
  buildRuntime(registry) {
    if (!this.framework)
      throw new Error("A runtime requires a selected framework");
    return new EngineRuntime(this.build(), registry);
  }
  buildJson(space = 2) {
    return JSON.stringify(this.build(), null, space);
  }
}
function isPositiveVector(value) {
  return Number.isFinite(value.x) && value.x > 0 && Number.isFinite(value.y) && value.y > 0;
}
function clone2(value) {
  return structuredClone(value);
}

class EngineEffectRegistry {
  definitions = new Map;
  register(definition) {
    validateDefinition2(definition);
    if (this.definitions.has(definition.id))
      throw new Error(`Duplicate effect definition '${definition.id}'`);
    this.definitions.set(definition.id, { ...definition, ...definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {} });
    return this;
  }
  get(id) {
    return this.definitions.get(id);
  }
  validate(effect) {
    if (!effect || typeof effect !== "object" || Array.isArray(effect))
      throw new Error("Malformed effect settings");
    const value = effect;
    if (typeof value.type !== "string" || !this.definitions.has(value.type))
      throw new Error(`Unknown effect '${String(value.type)}'`);
    if (value.schemaVersion !== undefined && value.schemaVersion !== 1)
      throw new Error(`Unsupported effect schema version for '${value.type}'`);
    assertJsonValue(value.typeValue);
    this.definitions.get(value.type).validatePayload?.(value.typeValue);
    if (value.target !== undefined)
      assertJsonValue(value.target);
    if (value.target !== undefined)
      this.definitions.get(value.type).validateTarget?.(value.target);
  }
  describe() {
    return [...this.definitions.values()].sort((a, b) => a.id.localeCompare(b.id)).map((definition) => ({
      id: definition.id,
      schemaVersion: definition.schemaVersion ?? 1,
      ...definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {},
      ...definition.targetType ? { targetType: definition.targetType } : {},
      ...definition.lifecycleCategory ? { lifecycleCategory: definition.lifecycleCategory } : {}
    }));
  }
}
function validateDefinition2(definition) {
  if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id))
    throw new Error("Invalid effect definition ID");
  if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1)
    throw new Error("Unsupported effect definition version");
  for (const value of [definition.targetType, definition.lifecycleCategory])
    if (value !== undefined && (typeof value !== "string" || value.length === 0))
      throw new Error(`Invalid effect definition '${definition.id}'`);
  if (definition.requiresCapability !== undefined && (!Array.isArray(definition.requiresCapability) || definition.requiresCapability.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid effect capabilities for '${definition.id}'`);
  if (definition.validatePayload !== undefined && typeof definition.validatePayload !== "function")
    throw new Error(`Invalid effect validator for '${definition.id}'`);
  if (definition.validateTarget !== undefined && typeof definition.validateTarget !== "function")
    throw new Error(`Invalid effect target validator for '${definition.id}'`);
}
function createTransformState(input) {
  const state = { schemaVersion: 1, position: { ...input.position }, rotation: input.rotation ?? 0 };
  validateTransformState(state);
  return structuredClone(state);
}
function createMovementState(input) {
  const state = { schemaVersion: 1, velocity: { ...input.velocity }, angularVelocity: input.angularVelocity ?? 0, enabled: input.enabled ?? true };
  validateMovementState(state);
  return structuredClone(state);
}
function validateTransformState(value) {
  const state = record(value, "Transform state");
  exactKeys(state, ["schemaVersion", "position", "rotation"], "Transform state");
  if (state.schemaVersion !== 1)
    throw new Error("Unsupported Transform state schema version");
  validateVector(state.position, "Transform position");
  finite(state.rotation, "Transform rotation");
}
function validateMovementState(value) {
  const state = record(value, "Movement state");
  exactKeys(state, ["schemaVersion", "velocity", "angularVelocity", "enabled"], "Movement state");
  if (state.schemaVersion !== 1)
    throw new Error("Unsupported Movement state schema version");
  validateVector(state.velocity, "Movement velocity");
  finite(state.angularVelocity, "Movement angularVelocity");
  if (typeof state.enabled !== "boolean")
    throw new Error("Movement enabled must be boolean");
}
function validateVector(value, label) {
  const vector = record(value, label);
  exactKeys(vector, ["x", "y"], label);
  finite(vector.x, `${label} x`);
  finite(vector.y, `${label} y`);
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unknown field '${key}'`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be finite`);
}
var MOVEMENT_CAPABILITY = "movement.state";
var MOVEMENT_SET_VELOCITY_EFFECT_ID = "movement.set-velocity";
var MOVEMENT_ADD_VELOCITY_EFFECT_ID = "movement.add-velocity";
var MOVEMENT_SCALE_SPEED_EFFECT_ID = "movement.scale-speed";
var MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID = "movement.apply-force-field";
var MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID = "movement.apply-force-to-entity";
var MOVEMENT_COMMAND_EFFECT_IDS = [MOVEMENT_SET_VELOCITY_EFFECT_ID, MOVEMENT_ADD_VELOCITY_EFFECT_ID, MOVEMENT_SCALE_SPEED_EFFECT_ID, MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID, MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID];
function movementSystemDefinition() {
  return { id: "core.movement", provides: [MOVEMENT_CAPABILITY], requiresCapabilities: ["transform.state", "movement.state"], acceptsEffects: [...MOVEMENT_COMMAND_EFFECT_IDS], before: ["core.playback"] };
}
var engine = {
  createWorld(options) {
    return new EngineWorldBuilder(options.id, options.worldSize);
  },
  createSystemRegistry() {
    return new EngineSystemRegistry;
  },
  createEffectRegistry() {
    return new EngineEffectRegistry;
  },
  createTransformState,
  createMovementState,
  createCounterState,
  canonicalizeCounterStates,
  validateCounterState,
  createEntity(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  createStructure(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  createEffect(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  validate(value) {
    assertJsonValue(value);
  },
  buildJson(settings, space = 2) {
    return JSON.stringify(settings, null, space);
  }
};
var DEFAULT_BUSES = [
  { id: "master", volume: 1, muted: false, maxVoices: 64, defaultPriority: 0, paused: false },
  { id: "music", volume: 1, muted: false, maxVoices: 1, defaultPriority: 50, paused: false },
  { id: "ambience", volume: 1, muted: false, maxVoices: 8, defaultPriority: 20, paused: false },
  { id: "effects", volume: 1, muted: false, maxVoices: 32, defaultPriority: 10, paused: false },
  { id: "ui", volume: 1, muted: false, maxVoices: 8, defaultPriority: 30, paused: false },
  { id: "voice", volume: 1, muted: false, maxVoices: 8, defaultPriority: 40, paused: false }
];

class AudioEmitter {
  soundSourceId;
  pending = [];
  constructor(soundSourceId) {
    this.soundSourceId = soundSourceId;
    validateId(soundSourceId, "sound source ID");
  }
  emit(command) {
    validateAudioCommand(command);
    if (command.sourceId !== this.soundSourceId)
      throw new Error(`Audio command source '${command.sourceId}' does not match emitter '${this.soundSourceId}'`);
    this.pending.push(clone3(command));
  }
  drainSoundCommands() {
    const commands = this.pending.map(clone3);
    this.pending = [];
    return commands;
  }
}

class SoundSystem {
  runtimeId;
  buses = new Map;
  persistent = new Map;
  pending = [];
  output;
  sequence;
  constructor(runtimeId, settings = { buses: clone3(DEFAULT_BUSES), persistentSources: [] }) {
    this.runtimeId = runtimeId;
    validateId(runtimeId, "runtime ID");
    for (const bus of settings.buses) {
      validateBus(bus);
      if (this.buses.has(bus.id))
        throw new Error(`Duplicate audio bus '${bus.id}'`);
      this.buses.set(bus.id, clone3(bus));
    }
    if (!this.buses.has("master"))
      this.buses.set("master", clone3(DEFAULT_BUSES[0]));
    for (const source of settings.persistentSources) {
      validatePersistentSource(source, this.buses);
      if (this.persistent.has(source.sourceId))
        throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
      this.persistent.set(source.sourceId, clone3(source));
    }
    this.sequence = settings.sequence ?? 0;
    this.output = emptyBatch(runtimeId, this.sequence, this.diagnostics());
  }
  submit(command) {
    validateAudioCommand(command);
    this.pending.push(clone3(command));
  }
  tick(candidates) {
    const collected = [];
    let ordinal = 0;
    for (const candidate of candidates.filter(isSoundEmitter).sort((a, b) => a.soundSourceId.localeCompare(b.soundSourceId))) {
      for (const command of candidate.drainSoundCommands())
        collected.push({ command, ordinal: ordinal++ });
    }
    for (const command of this.pending.splice(0))
      collected.push({ command, ordinal: ordinal++ });
    const result = this.aggregate(collected);
    this.output = { schemaVersion: 1, runtimeId: this.runtimeId, sequence: ++this.sequence, commands: result.commands, diagnostics: { ...this.diagnostics(), ...result.diagnostics, sequence: this.sequence } };
  }
  drainOutput() {
    const value = clone3(this.output);
    this.output = emptyBatch(this.runtimeId, this.sequence, this.diagnostics());
    return value;
  }
  restorePersistentIntent() {
    for (const source of [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)))
      this.pending.push(clone3(source.command));
  }
  toSettings(framework = createDefaultAudioFramework()) {
    const settings = { schemaVersion: 1, runtimeId: this.runtimeId, buses: [...this.buses.values()].sort(byBus).map(clone3), persistentSources: [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(clone3), framework: clone3(framework), sequence: this.sequence };
    validateAudioSettings(settings);
    return settings;
  }
  getDiagnostics() {
    return clone3(this.diagnostics());
  }
  aggregate(collected) {
    let rejected = 0;
    let deduplicated = 0;
    let droppedByPriority = 0;
    const valid = [];
    for (const entry of collected) {
      try {
        validateAudioCommand(entry.command);
        validateBusReference(entry.command, this.buses);
        valid.push(entry);
      } catch {
        rejected++;
      }
    }
    const dedupe = new Map;
    const retained = [];
    for (const entry of valid) {
      const key = entry.command.type === "playSound" && entry.command.dedupeKey ? `${entry.command.sourceId}|${entry.command.dedupeKey}` : undefined;
      if (!key) {
        retained.push(entry);
        continue;
      }
      const prior = dedupe.get(key);
      if (!prior || compareCommand(entry.command, prior.command, entry.ordinal, prior.ordinal, this.buses) < 0) {
        if (prior)
          deduplicated++;
        dedupe.set(key, entry);
      } else
        deduplicated++;
    }
    retained.push(...dedupe.values());
    const admitted = [];
    for (const [busId, entries] of groupBy(retained.filter((entry) => isVoiceCommand(entry.command)), (entry) => commandBus(entry.command)).entries()) {
      const bus = this.buses.get(busId);
      const ordered = entries.sort((a, b) => compareCommand(a.command, b.command, a.ordinal, b.ordinal, this.buses));
      admitted.push(...ordered.slice(0, bus.maxVoices));
      droppedByPriority += Math.max(0, ordered.length - bus.maxVoices);
    }
    admitted.push(...retained.filter((entry) => !isVoiceCommand(entry.command)));
    for (const entry of admitted)
      this.applyPersistent(entry.command);
    const commands = admitted.sort((a, b) => comparePipeline(a.command, b.command, a.ordinal, b.ordinal, this.buses)).map((entry) => this.resolve(entry.command));
    return { commands, diagnostics: { collected: collected.length, rejected, deduplicated, droppedByPriority } };
  }
  resolve(command) {
    return { ...clone3(command), runtimeId: this.runtimeId, globalSourceId: `${this.runtimeId}:${command.sourceId}`, sequence: this.sequence + 1 };
  }
  applyPersistent(command) {
    if (command.type === "startLoop" || command.type === "playMusic")
      this.persistent.set(command.sourceId, { sourceId: command.sourceId, command: clone3(command) });
    if (command.type === "stopSource")
      this.persistent.delete(command.sourceId);
    if (command.type === "stopMusic") {
      for (const [id, source] of this.persistent)
        if (source.command.type === "playMusic" && (!command.sourceId || command.sourceId === id))
          this.persistent.delete(id);
    }
    if (command.type === "stopAll")
      this.persistent.clear();
    if (command.type === "setBusVolume") {
      const bus = this.buses.get(command.bus);
      bus.volume = command.volume;
      if (command.muted !== undefined)
        bus.muted = command.muted;
    }
    if (command.type === "pauseBus" || command.type === "resumeBus")
      this.buses.get(command.bus).paused = command.type === "pauseBus";
  }
  diagnostics() {
    return { collected: 0, rejected: 0, deduplicated: 0, droppedByPriority: 0, activePersistentSources: [...this.persistent.keys()].sort(), outputStatus: "ready", sequence: this.sequence };
  }
}

class AudioRuntime {
  system;
  framework;
  constructor(settings) {
    validateAudioSettings(settings);
    this.framework = clone3(settings.framework);
    this.system = new SoundSystem(settings.runtimeId, settings);
  }
  tick(emitters) {
    this.system.tick(emitters);
  }
  submit(command) {
    this.system.submit(command);
  }
  drainOutput() {
    return this.system.drainOutput();
  }
  restorePersistentIntent() {
    this.system.restorePersistentIntent();
  }
  toSettings() {
    return this.system.toSettings(this.framework);
  }
  getDiagnostics() {
    return this.system.getDiagnostics();
  }
}

class ApplicationAudioMixer {
  applicationId;
  buses = new Map;
  pending = [];
  activeMusic;
  sequence;
  constructor(applicationId, settings = { buses: clone3(DEFAULT_BUSES) }) {
    this.applicationId = applicationId;
    validateId(applicationId, "application ID");
    for (const bus of settings.buses) {
      validateBus(bus);
      if (this.buses.has(bus.id))
        throw new Error(`Duplicate audio bus '${bus.id}'`);
      this.buses.set(bus.id, clone3(bus));
    }
    if (!this.buses.has("master"))
      this.buses.set("master", clone3(DEFAULT_BUSES[0]));
    if (settings.activeMusic) {
      validateResolvedCommand(settings.activeMusic);
      this.activeMusic = clone3(settings.activeMusic);
    }
    this.sequence = settings.sequence ?? 0;
  }
  submit(batch) {
    validateAudioBatch(batch);
    this.pending.push(clone3(batch));
  }
  flush() {
    const submitted = this.pending.splice(0).flatMap((batch) => batch.commands);
    const rejected = submitted.filter((command) => ("bus" in command) && command.bus !== undefined && !this.buses.has(command.bus)).length;
    const incoming = submitted.filter((command) => !(("bus" in command) && command.bus !== undefined && !this.buses.has(command.bus))).sort((a, b) => compareResolved(a, b, this.buses));
    const controls = incoming.filter((command) => !isVoiceCommand(command));
    for (const command of controls)
      this.applyControl(command);
    const voices = incoming.filter(isVoiceCommand);
    const music = voices.filter((command) => command.type === "playMusic");
    const nonMusic = this.limitVoices(voices.filter((command) => command.type !== "playMusic"));
    const previousMusic = this.activeMusic;
    const selectedMusic = this.selectMusic(music);
    const replacedMusic = selectedMusic && previousMusic && previousMusic.globalSourceId !== selectedMusic.globalSourceId ? [{ type: "stopSource", sourceId: previousMusic.sourceId, runtimeId: previousMusic.runtimeId, globalSourceId: previousMusic.globalSourceId, sequence: this.sequence + 1 }] : [];
    const commands = [...controls, ...replacedMusic, ...nonMusic, ...selectedMusic ? [selectedMusic] : []].sort((a, b) => compareResolved(a, b, this.buses));
    const diagnostics = { collected: submitted.length, rejected, deduplicated: 0, droppedByPriority: Math.max(0, voices.filter((command) => command.type !== "playMusic").length - nonMusic.length) + Math.max(0, music.length - (selectedMusic ? 1 : 0)), activePersistentSources: this.activeMusic ? [this.activeMusic.globalSourceId] : [], activeMusicSourceId: this.activeMusic?.globalSourceId, outputStatus: "ready", sequence: ++this.sequence };
    return { schemaVersion: 1, runtimeId: this.applicationId, sequence: this.sequence, commands: commands.map((command) => ({ ...command, sequence: this.sequence })), diagnostics };
  }
  toSettings() {
    const settings = { schemaVersion: 1, applicationId: this.applicationId, buses: [...this.buses.values()].sort(byBus).map(clone3), ...this.activeMusic ? { activeMusic: clone3(this.activeMusic) } : {}, sequence: this.sequence };
    validateApplicationAudioSettings(settings);
    return settings;
  }
  limitVoices(commands) {
    const result = [];
    for (const [busId, entries] of groupBy(commands, (command) => commandBus(command)).entries())
      result.push(...entries.sort((a, b) => compareResolved(a, b, this.buses)).slice(0, this.buses.get(busId).maxVoices));
    return result;
  }
  selectMusic(candidates) {
    const ordered = candidates.sort((a, b) => compareResolved(a, b, this.buses));
    for (const candidate of ordered) {
      const policy = candidate.replacementPolicy ?? "replace-lower-or-equal";
      const currentPriority = this.activeMusic ? resolvedPriority(this.activeMusic, this.buses) : -Infinity;
      const priority = resolvedPriority(candidate, this.buses);
      if (!this.activeMusic || policy === "replace-current" || policy === "replace-lower-or-equal" && priority >= currentPriority || policy === "keep-current" && !this.activeMusic) {
        this.activeMusic = clone3(candidate);
        return candidate;
      }
    }
    return;
  }
  applyControl(command) {
    if (command.type === "stopMusic" && (!command.sourceId || this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`))
      this.activeMusic = undefined;
    if (command.type === "stopSource" && this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`)
      this.activeMusic = undefined;
    if (command.type === "stopAll")
      this.activeMusic = undefined;
    if (command.type === "setBusVolume") {
      const bus = this.buses.get(command.bus);
      if (bus) {
        bus.volume = command.volume;
        if (command.muted !== undefined)
          bus.muted = command.muted;
      }
    }
    if (command.type === "pauseBus" || command.type === "resumeBus") {
      const bus = this.buses.get(command.bus);
      if (bus)
        bus.paused = command.type === "pauseBus";
    }
  }
}
function createDefaultAudioFramework() {
  const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
  return registry.select(["audio.collect", "audio.mix"]);
}
function createAudioRuntime(settings) {
  return new AudioRuntime(settings);
}
function createAudioSettings(options) {
  return { schemaVersion: 1, runtimeId: options.runtimeId, buses: clone3(options.buses ?? DEFAULT_BUSES), persistentSources: clone3(options.persistentSources ?? []), framework: createDefaultAudioFramework(), sequence: 0 };
}
function validateAudioSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio settings");
  const settings = value;
  if (settings.schemaVersion !== 1 || typeof settings.runtimeId !== "string" || !Array.isArray(settings.buses) || !Array.isArray(settings.persistentSources) || !settings.framework || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
    throw new Error("Malformed audio settings");
  const sequence = settings.sequence;
  validateId(settings.runtimeId, "runtime ID");
  const buses = new Map;
  for (const bus of settings.buses) {
    validateBus(bus);
    if (buses.has(bus.id))
      throw new Error(`Duplicate audio bus '${bus.id}'`);
    buses.set(bus.id, bus);
  }
  if (!buses.has("master"))
    throw new Error("Audio settings require a master bus");
  const sources = new Set;
  for (const source of settings.persistentSources) {
    validatePersistentSource(source, buses);
    if (sources.has(source.sourceId))
      throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
    sources.add(source.sourceId);
  }
  const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
  registry.validate(settings.framework);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(settings);
}
function validateApplicationAudioSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed application audio settings");
  const settings = value;
  if (settings.schemaVersion !== 1 || typeof settings.applicationId !== "string" || !Array.isArray(settings.buses) || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
    throw new Error("Malformed application audio settings");
  const sequence = settings.sequence;
  validateId(settings.applicationId, "application ID");
  const ids = new Set;
  for (const bus of settings.buses) {
    validateBus(bus);
    if (ids.has(bus.id))
      throw new Error(`Duplicate audio bus '${bus.id}'`);
    ids.add(bus.id);
  }
  if (!ids.has("master"))
    throw new Error("Application audio settings require a master bus");
  if (settings.activeMusic)
    validateResolvedCommand(settings.activeMusic);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(settings);
}
function validateAudioCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio command");
  const command = value;
  if (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type))
    throw new Error("Unknown audio command");
  if (command.type !== "stopMusic")
    validateId(command.sourceId, "audio source ID");
  else if (command.sourceId !== undefined)
    validateId(command.sourceId, "audio source ID");
  if ("soundId" in command)
    validateId(command.soundId, "sound ID");
  if ("bus" in command && command.bus !== undefined)
    validateId(command.bus, "audio bus ID");
  if ("instanceId" in command && command.instanceId !== undefined)
    validateId(command.instanceId, "audio instance ID");
  if ("dedupeKey" in command && command.dedupeKey !== undefined)
    validateId(command.dedupeKey, "audio dedupe key");
  for (const name of ["volume", "pitch", "pan", "fadeInMs", "fadeOutMs", "priority"]) {
    const numeric = command[name];
    if (numeric !== undefined && (typeof numeric !== "number" || !Number.isFinite(numeric) || name === "volume" && (numeric < 0 || numeric > 1) || name === "pitch" && numeric <= 0 || name === "pan" && (numeric < -1 || numeric > 1) || (name === "fadeInMs" || name === "fadeOutMs") && numeric < 0 || name === "priority" && !Number.isInteger(numeric)))
      throw new Error(`Invalid audio ${name}`);
  }
  if (command.type === "playMusic" && command.replacementPolicy !== undefined && !["replace-current", "replace-lower-or-equal", "keep-current"].includes(command.replacementPolicy))
    throw new Error("Invalid music replacement policy");
  assertJsonValue(command);
}
function validateAudioBatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio batch");
  const batch = value;
  if (batch.schemaVersion !== 1 || typeof batch.runtimeId !== "string" || typeof batch.sequence !== "number" || !Number.isSafeInteger(batch.sequence) || batch.sequence < 0 || !Array.isArray(batch.commands) || !batch.diagnostics)
    throw new Error("Malformed audio batch");
  const sequence = batch.sequence;
  validateId(batch.runtimeId, "runtime ID");
  for (const command of batch.commands)
    validateResolvedCommand(command);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(batch);
}
var audio = {
  engine: { createSystemRegistry: engine.createSystemRegistry },
  createSettings: createAudioSettings,
  createRuntime: createAudioRuntime,
  createApplicationMixer(applicationId, settings) {
    return new ApplicationAudioMixer(applicationId, settings);
  },
  createDefaultFramework: createDefaultAudioFramework,
  emitter(sourceId) {
    return new AudioEmitter(sourceId);
  },
  bus(settings) {
    validateBus(settings);
    return clone3(settings);
  },
  command: {
    play(settings) {
      return { type: "playSound", ...clone3(settings) };
    },
    loop(settings) {
      return { type: "startLoop", ...clone3(settings) };
    },
    music(settings) {
      return { type: "playMusic", ...clone3(settings) };
    },
    stopSource(settings) {
      return { type: "stopSource", ...clone3(settings) };
    },
    stopInstance(settings) {
      return { type: "stopInstance", ...clone3(settings) };
    },
    stopMusic(settings = {}) {
      return { type: "stopMusic", ...clone3(settings) };
    },
    setBusVolume(settings) {
      return { type: "setBusVolume", ...clone3(settings) };
    },
    pauseBus(settings) {
      return { type: "pauseBus", ...clone3(settings) };
    },
    resumeBus(settings) {
      return { type: "resumeBus", ...clone3(settings) };
    },
    stopAll(settings) {
      return { type: "stopAll", ...clone3(settings) };
    }
  },
  validate: validateAudioSettings,
  validateCommand: validateAudioCommand,
  validateBatch: validateAudioBatch
};
var COMMAND_TYPES = new Set(["playSound", "startLoop", "playMusic", "stopSource", "stopInstance", "stopMusic", "pauseBus", "resumeBus", "setBusVolume", "stopAll"]);
function isSoundEmitter(value) {
  return !!value && typeof value === "object" && typeof value.soundSourceId === "string" && typeof value.drainSoundCommands === "function";
}
function validateId(value, name) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`);
}
function validateBus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio bus");
  const bus = value;
  validateId(bus.id, "audio bus ID");
  const volume = bus.volume;
  const maxVoices = bus.maxVoices;
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1 || typeof bus.muted !== "boolean" || typeof maxVoices !== "number" || !Number.isSafeInteger(maxVoices) || maxVoices < 1 || !Number.isSafeInteger(bus.defaultPriority) || typeof bus.paused !== "boolean")
    throw new Error(`Invalid audio bus '${bus.id}'`);
  assertJsonValue(bus);
}
function validatePersistentSource(value, buses) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed persistent audio source");
  const source = value;
  validateId(source.sourceId, "persistent source ID");
  validateAudioCommand(source.command);
  if (source.command.type !== "startLoop" && source.command.type !== "playMusic")
    throw new Error("Persistent audio source must be a loop or music command");
  if (source.command.sourceId !== source.sourceId)
    throw new Error("Persistent audio source ID mismatch");
  validateBusReference(source.command, buses);
}
function validateBusReference(command, buses) {
  if ("bus" in command && command.bus !== undefined && !buses.has(command.bus))
    throw new Error(`Unknown audio bus '${command.bus}'`);
}
function validateResolvedCommand(value) {
  validateAudioCommand(value);
  const command = value;
  validateId(command.runtimeId, "runtime ID");
  validateId(command.globalSourceId, "global audio source ID");
  const sequence = command.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0)
    throw new Error("Invalid audio sequence");
}
function commandBus(command) {
  return "bus" in command && command.bus ? command.bus : command.type === "playMusic" ? "music" : "effects";
}
function isVoiceCommand(command) {
  return command.type === "playSound" || command.type === "startLoop" || command.type === "playMusic";
}
function resolvedPriority(command, buses) {
  return command.priority ?? buses.get(commandBus(command))?.defaultPriority ?? 0;
}
function compareCommand(a, b, aOrdinal, bOrdinal, buses) {
  return resolvedPriority(b, buses) - resolvedPriority(a, buses) || commandBus(a).localeCompare(commandBus(b)) || (a.sourceId ?? "").localeCompare(b.sourceId ?? "") || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || aOrdinal - bOrdinal;
}
function pipelineOrder(command) {
  if (command.type === "stopAll" || command.type === "pauseBus" || command.type === "resumeBus" || command.type === "setBusVolume")
    return 0;
  if (command.type === "stopSource" || command.type === "stopInstance" || command.type === "stopMusic")
    return 1;
  if (command.type === "playMusic")
    return 2;
  if (command.type === "startLoop")
    return 3;
  return 4;
}
function comparePipeline(a, b, aOrdinal, bOrdinal, buses) {
  return pipelineOrder(a) - pipelineOrder(b) || compareCommand(a, b, aOrdinal, bOrdinal, buses);
}
function compareResolved(a, b, buses) {
  return pipelineOrder(a) - pipelineOrder(b) || resolvedPriority(b, buses) - resolvedPriority(a, buses) || a.globalSourceId.localeCompare(b.globalSourceId) || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || a.sequence - b.sequence;
}
function byBus(a, b) {
  return a.id.localeCompare(b.id);
}
function emptyBatch(runtimeId, sequence, diagnostics) {
  return { schemaVersion: 1, runtimeId, sequence, commands: [], diagnostics: { ...diagnostics, sequence } };
}
function groupBy(items, key) {
  const grouped = new Map;
  for (const item of items) {
    const id = key(item);
    const values = grouped.get(id) ?? [];
    values.push(item);
    grouped.set(id, values);
  }
  return grouped;
}
function clone3(value) {
  return structuredClone(value);
}
function validateAnimationSettings(value) {
  if (!isRecord3(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.channel !== "string" || !positiveInteger(value.durationTicks) || !integer(value.priority) || !INTERRUPTIONS.has(value.interruption) || !Array.isArray(value.tracks))
    throw new Error("Malformed animation settings");
  assertKeys(value, ["schemaVersion", "id", "channel", "durationTicks", "priority", "interruption", "tracks"], "animation settings");
  validateId2(value.id, "animation ID");
  validateId2(value.channel, "animation channel");
  const ids = new Set;
  for (const track of value.tracks) {
    if (!isRecord3(track) || typeof track.id !== "string" || !Array.isArray(track.keyframes))
      throw new Error("Malformed animation track");
    assertKeys(track, ["id", "keyframes"], "animation track");
    validateId2(track.id, "animation track ID");
    if (ids.has(track.id))
      throw new Error(`Duplicate animation track '${track.id}'`);
    ids.add(track.id);
    let previous = -1;
    for (const keyframe of track.keyframes) {
      if (!isRecord3(keyframe) || !nonNegativeInteger(keyframe.tick) || keyframe.tick > value.durationTicks || keyframe.tick <= previous)
        throw new Error("Invalid animation keyframe");
      assertKeys(keyframe, ["tick", "value"], "animation keyframe");
      assertJsonValue(keyframe.value);
      previous = keyframe.tick;
    }
    if (track.keyframes.length === 0)
      throw new Error("Animation tracks require keyframes");
  }
  assertJsonValue(value);
}
function validatePresentationEvent(value) {
  if (!isRecord3(value) || value.schemaVersion !== 1 || value.type !== "play" && value.type !== "cancel" || typeof value.eventId !== "string")
    throw new Error("Malformed presentation event");
  assertKeys(value, ["schemaVersion", "type", "eventId", "channel", "animationId", "instanceId", "priority", "payload"], "presentation event");
  validateId2(value.eventId, "presentation event ID");
  if (value.channel !== undefined)
    validateId2(value.channel, "presentation channel");
  if (value.animationId !== undefined)
    validateId2(value.animationId, "animation ID");
  if (value.instanceId !== undefined)
    validateId2(value.instanceId, "presentation instance ID");
  if (value.priority !== undefined && !integer(value.priority))
    throw new Error("Invalid presentation priority");
  if (value.type === "play" && value.animationId === undefined)
    throw new Error("Play events require an animation ID");
  if (value.type === "cancel" && value.instanceId === undefined && value.channel === undefined)
    throw new Error("Cancel events require an instance or channel");
  if (value.payload !== undefined)
    assertJsonValue(value.payload);
  assertJsonValue(value);
}
function validatePresentationRuntimeSettings(value) {
  if (!isRecord3(value) || value.schemaVersion !== 1 || typeof value.runtimeId !== "string" || !nonNegativeInteger(value.tick) || !nonNegativeInteger(value.sequence) || !Array.isArray(value.active) || !Array.isArray(value.pending))
    throw new Error("Malformed presentation runtime settings");
  assertKeys(value, ["schemaVersion", "runtimeId", "tick", "sequence", "active", "pending"], "presentation runtime settings");
  validateId2(value.runtimeId, "presentation runtime ID");
  for (const active of value.active) {
    if (!isRecord3(active) || typeof active.instanceId !== "string" || typeof active.animationId !== "string" || typeof active.channel !== "string" || !nonNegativeInteger(active.startTick) || !integer(active.priority))
      throw new Error("Malformed active animation");
    assertKeys(active, ["instanceId", "animationId", "channel", "startTick", "priority"], "active animation");
    validateId2(active.instanceId, "presentation instance ID");
    validateId2(active.animationId, "animation ID");
    validateId2(active.channel, "presentation channel");
  }
  for (const event of value.pending)
    validatePresentationEvent(event);
  assertJsonValue(value);
}

class PresentationRuntime {
  runtimeId;
  animations = new Map;
  active = new Map;
  pending = [];
  tickNumber;
  sequence;
  lastFrame;
  constructor(runtimeId, settings) {
    this.runtimeId = runtimeId;
    validateId2(runtimeId, "presentation runtime ID");
    for (const animation of settings.animations) {
      validateAnimationSettings(animation);
      if (this.animations.has(animation.id))
        throw new Error(`Duplicate animation '${animation.id}'`);
      this.animations.set(animation.id, clone4(animation));
    }
    this.tickNumber = settings.tick ?? 0;
    this.sequence = settings.sequence ?? 0;
    for (const item of settings.active ?? [])
      this.restoreActive(item);
    for (const event of settings.pending ?? []) {
      validatePresentationEvent(event);
      this.pending.push(clone4(event));
    }
    this.lastFrame = this.frame([]);
  }
  emit(event) {
    validatePresentationEvent(event);
    this.pending.push(clone4(event));
  }
  tick(ticks = 1) {
    if (!nonNegativeInteger(ticks))
      throw new Error("Presentation tick count must be a non-negative integer");
    const records = [];
    for (let step = 0;step < ticks; step++) {
      this.tickNumber++;
      this.processPending(records);
      this.expire(records);
    }
    this.lastFrame = this.frame(records);
    return clone4(this.lastFrame);
  }
  project() {
    return clone4(this.frame([]));
  }
  toSettings() {
    const settings = { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [...this.active.values()].sort(byInstance).map(clone4), pending: this.pending.map(clone4) };
    validatePresentationRuntimeSettings(settings);
    return settings;
  }
  processPending(records) {
    const pending = this.pending.splice(0).map((event, ordinal) => ({ event, ordinal })).sort((a, b) => this.eventPriority(b.event) - this.eventPriority(a.event) || a.ordinal - b.ordinal || a.event.eventId.localeCompare(b.event.eventId));
    for (const { event } of pending) {
      if (event.type === "cancel") {
        for (const item2 of [...this.active.values()])
          if (event.instanceId && item2.instanceId === event.instanceId || event.channel && item2.channel === event.channel)
            this.cancel(item2, records, event.eventId);
        continue;
      }
      const animation = this.animations.get(event.animationId);
      if (!animation)
        throw new Error(`Unknown animation '${event.animationId}'`);
      const current = this.active.get(animation.channel);
      if (current && (animation.interruption === "ignore" || animation.interruption === "higher-priority" && animation.priority <= current.priority))
        continue;
      if (current)
        this.cancel(current, records, event.eventId);
      const item = { instanceId: event.instanceId ?? `${this.runtimeId}:${event.eventId}`, animationId: animation.id, channel: animation.channel, startTick: this.tickNumber, priority: animation.priority };
      this.active.set(animation.channel, item);
      records.push(this.record({ ...event, type: "play", animationId: animation.id, instanceId: item.instanceId }, this.sequence++));
    }
  }
  eventPriority(event) {
    return event.priority ?? (event.type === "play" ? this.animations.get(event.animationId)?.priority ?? 0 : 0);
  }
  cancel(item, records, eventId) {
    this.active.delete(item.channel);
    records.push(this.record({ schemaVersion: 1, type: "cancel", eventId, instanceId: item.instanceId, channel: item.channel }, this.sequence++));
  }
  expire(records) {
    for (const item of [...this.active.values()]) {
      const animation = this.animations.get(item.animationId);
      if (this.tickNumber - item.startTick >= animation.durationTicks)
        this.cancel(item, records, `${item.instanceId}:complete`);
    }
  }
  record(event, sequence) {
    return { ...clone4(event), sequence, tick: this.tickNumber };
  }
  frame(events) {
    return { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, events: events.map(clone4), animations: [...this.active.values()].sort(byInstance).map((item) => this.projectAnimation(item)) };
  }
  projectAnimation(item) {
    const animation = this.animations.get(item.animationId);
    const localTick = Math.max(0, this.tickNumber - item.startTick);
    const values = {};
    for (const track of animation.tracks)
      values[track.id] = sample(track.keyframes, localTick);
    return { instanceId: item.instanceId, animationId: item.animationId, channel: item.channel, priority: item.priority, localTick, progress: Math.min(1, localTick / animation.durationTicks), values };
  }
  restoreActive(item) {
    validatePresentationRuntimeSettings({ schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [item], pending: [] });
    if (this.active.has(item.channel))
      throw new Error(`Duplicate active animation channel '${item.channel}'`);
    if (!this.animations.has(item.animationId))
      throw new Error(`Unknown animation '${item.animationId}'`);
    this.active.set(item.channel, clone4(item));
  }
}
function sample(keyframes, tick) {
  let result = keyframes[0].value;
  for (const keyframe of keyframes) {
    if (keyframe.tick > tick)
      break;
    result = keyframe.value;
  }
  return clone4(result);
}
function validateId2(value, name) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`);
}
function assertKeys(value, allowed, name) {
  const keys = new Set(allowed);
  for (const key of Object.keys(value))
    if (!keys.has(key))
      throw new Error(`Unknown ${name} field '${key}'`);
}
function isRecord3(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function nonNegativeInteger(value) {
  return integer(value) && value >= 0;
}
function positiveInteger(value) {
  return integer(value) && value > 0;
}
function clone4(value) {
  return structuredClone(value);
}
function byInstance(a, b) {
  return a.channel.localeCompare(b.channel) || a.instanceId.localeCompare(b.instanceId);
}
var INTERRUPTIONS = new Set(["replace", "higher-priority", "ignore"]);

// src/movement.ts
function registerMovementSystem(registry) {
  return registry.register(movementSystemDefinition(), (context) => {
    for (const entity of context.query(["transform.state", "movement.state"])) {
      const transform = entity.getComponent("transform");
      const movement = entity.getComponent("movement");
      if (!transform || !movement || !movement.enabled)
        continue;
      transform.position.x += movement.velocity.x * context.deltaSeconds;
      transform.position.y += movement.velocity.y * context.deltaSeconds;
      transform.rotation += movement.angularVelocity * context.deltaSeconds;
    }
  });
}
export {
  validatePhysicsBody,
  registerMovementSystem,
  isStructureCollisionRole,
  isPhysicsParticipant,
  isFiniteVector,
  getShapeName,
  forwardVectorFromRotation,
  SHAPE,
  PHYSICS_CONTACT_SLOP,
  PHYSICS_CONTACT_PERCENT,
  PHYSICS_CONTACT_EPSILON,
  MAX_CONTACT_SOLVER_ITERATIONS,
  MAX_COLLISION_IMPULSE,
  MAX_CCD_SUBSTEPS,
  CCD_MAX_STEP_SIZE
};
