/**
 * Screeps Traffic Manager
 *
 * Manages creep movement to reduce congestion and improve pathing efficiency.
 */

const DIRECTIONS = [
  null,
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
]

/**
 * Registers the intended move for a creep.
 *
 * @param {Creep|PowerCreep} creep - The creep whose movement is being registered.
 * @param {RoomPosition|DirectionConstant} target - The target position or movement direction.
 */
function registerMove(creep, target, priority = 1) {
  let targetCoord = typeof target === "number" ? getDirectionTarget(creep.pos, target) : target

  creep._intendedPackedCoord = packCoordinates(targetCoord)
  creep._movePriority = Math.floor(priority)
}

/**
 * Gets the movement priority of a creep.
 *
 * @param {Creep} creep - The creep to retrieve priority for.
 * @returns {number} - The priority, defaults to 1.
 */
function getMovePriority(creep) {
  return creep._movePriority !== undefined ? creep._movePriority : 1
}

/**
 * Sets the working area for a creep.
 *
 * @param {Creep|PowerCreep} creep - The creep to assign a working area.
 * @param {RoomPosition} pos - The center of the working area.
 * @param {number} range - The allowed working range from the center.
 */
function setWorkingArea(creep, pos, range) {
  creep._workingPos = pos
  creep._workingRange = range
}

/**
 * Resolves traffic congestion in a room. Should be called after all moves are registered.
 *
 * @param {Room} room - The room where movement will be managed.
 * @param {CostMatrix} [costs] - An optional cost matrix for movement calculations.
 * @param {number} [movementCostThreshold=255] - Creeps will not move to tiles with cost greater than or equal to this value.
 */
function run(room, costs, movementCostThreshold = 255) {
  const movementMap = new Map()

  const terrain = Game.map.getRoomTerrain(room.name)

  const creepsInRoom = [...room.find(FIND_MY_CREEPS), ...room.find(FIND_MY_POWER_CREEPS)]

  creepsInRoom.forEach((creep) => assignCreepToCoordinate(creep, creep.pos, movementMap))

  for (const creep of creepsInRoom) {
    const intendedPackedCoord = getIntendedPackedCoord(creep)

    if (!intendedPackedCoord) {
      continue
    }

    const matchedPackedCoord = getMatchedPackedCoord(creep)

    if (matchedPackedCoord === intendedPackedCoord) continue

    const visitedCreeps = new Set()

    movementMap.delete(matchedPackedCoord)

    deleteMatchedPackedCoord(creep)

    if (depthFirstSearch(creep, 0, terrain, costs, movementCostThreshold, movementMap, visitedCreeps, true) > 0)
      continue

    assignCreepToCoordinate(creep, creep.pos, movementMap)
  }

  creepsInRoom.forEach((creep) => resolveMovement(creep))
}

/**
 * Recursively searches for the best movement option for a creep.
 *
 * @param {Creep} creep - The creep attempting to move.
 * @param {number} score - The movement score.
 * @param {RoomTerrain} terrain - The room's terrain data.
 * @param {CostMatrix} costs - The cost matrix.
 * @param {number} movementCostThreshold - Creeps will not move to tiles with cost greater than or equal to this value.
 * @param {Map} movementMap - The movement map tracking occupied coordinates.
 * @param {Set} visitedCreeps - Set of visited creeps to prevent loops.
 * @returns {number} - A score indicating movement success.
 */
function depthFirstSearch(
  creep,
  score = 0,
  terrain,
  costs,
  movementCostThreshold,
  movementMap,
  visitedCreeps,
  isRoot = false,
) {
  visitedCreeps.add(creep.name)

  if (!creep.my) {
    return -Infinity
  }

  const intendedPackedCoord = getIntendedPackedCoord(creep)

  // Phase 1: Try intended coordinate first
  if (intendedPackedCoord) {
    const intendedCoord = unpackCoordinates(intendedPackedCoord)
    let tempScore = score + getMovePriority(creep)
    const occupyingCreep = movementMap.get(intendedPackedCoord)

    if (!occupyingCreep) {
      if (tempScore > 0) {
        assignCreepToCoordinate(creep, intendedCoord, movementMap)
        return tempScore
      }
    } else if (!visitedCreeps.has(occupyingCreep.name)) {
      let nextScore = tempScore
      if (getIntendedPackedCoord(occupyingCreep) === intendedPackedCoord) {
        nextScore -= getMovePriority(occupyingCreep)
      }
      const result = depthFirstSearch(
        occupyingCreep,
        nextScore,
        terrain,
        costs,
        movementCostThreshold,
        movementMap,
        visitedCreeps,
        false,
      )
      if (result > 0) {
        assignCreepToCoordinate(creep, intendedCoord, movementMap)
        return result
      }
    }
  }

  // Phase 2: If root creep, do NOT side-step.
  if (isRoot) return -Infinity

  // Phase 3: Side-stepping fallback (for idle creeps, or pushed busy creeps)
  const emptyTiles = []
  const occupiedTiles = []

  for (const coord of getPossibleMoves(creep, terrain, costs, movementCostThreshold)) {
    const packedCoord = packCoordinates(coord)
    if (packedCoord === intendedPackedCoord) continue // Already tried this

    const occupied = movementMap.get(packedCoord)

    if (occupied) {
      occupiedTiles.push(coord)
    } else {
      emptyTiles.push(coord)
    }
  }

  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    const packedCoord = packCoordinates(coord)
    let tempScore = score // Does not increment because it's not the intended tile
    const occupyingCreep = movementMap.get(packedCoord)

    if (!occupyingCreep) {
      if (tempScore > 0) {
        assignCreepToCoordinate(creep, coord, movementMap)
        return tempScore
      }
    } else if (!visitedCreeps.has(occupyingCreep.name)) {
      let nextScore = tempScore
      if (getIntendedPackedCoord(occupyingCreep) === packedCoord) {
        nextScore -= getMovePriority(occupyingCreep)
      }

      const result = depthFirstSearch(
        occupyingCreep,
        nextScore,
        terrain,
        costs,
        movementCostThreshold,
        movementMap,
        visitedCreeps,
        false,
      )
      if (result > 0) {
        assignCreepToCoordinate(creep, coord, movementMap)
        return result
      }
    }
  }

  return -Infinity
}

/**
 * Moves a creep based on its assigned coordinate.
 *
 * @param {Creep} creep - The creep to move.
 */
function resolveMovement(creep) {
  const matchedPos = unpackCoordinates(getMatchedPackedCoord(creep))

  if (!creep.pos.isEqualTo(matchedPos.x, matchedPos.y)) {
    creep.move(creep.pos.getDirectionTo(matchedPos.x, matchedPos.y))
  }
}

/**
 * Get the possible movement options for a creep.
 *
 * @param {Creep} creep - The creep to check movement for.
 * @param {RoomTerrain} terrain - The room's terrain data.
 * @param {CostMatrix} costs - The cost matrix.
 * @param {number} movementCostThreshold - Creeps will not move to tiles with cost greater than or equal to this value.
 * @returns {Array<{x: number, y: number}>} - An array of possible movement coordinates.
 */
function getPossibleMoves(creep, terrain, costs, movementCostThreshold) {
  if (creep._possibleMoves) {
    return creep._possibleMoves
  }

  const possibleMoves = []

  if (!canMove(creep)) {
    creep._possibleMoves = possibleMoves
    return possibleMoves
  }

  const intendedPackedCoord = getIntendedPackedCoord(creep)

  let hash = 0
  if (creep.name) {
    for (let i = 0; i < creep.name.length; i++) hash += creep.name.charCodeAt(i)
  }

  const directionOrder = []

  if (intendedPackedCoord) {
    const intendedCoord = unpackCoordinates(intendedPackedCoord)
    const targetDirection = creep.pos.getDirectionTo(intendedCoord.x, intendedCoord.y)

    if (!targetDirection) {
      const offset = (Game.time + hash) % 8
      for (let i = 0; i < 8; i++) directionOrder.push(((i + offset) % 8) + 1)
    } else {
      const distances = [0, 1, 2, 3, 4]
      const hashBool = (Game.time + hash) % 2 === 0

      for (const dist of distances) {
        if (dist === 0) {
          directionOrder.push(targetDirection)
        } else if (dist === 4) {
          let opp = targetDirection + 4
          if (opp > 8) opp -= 8
          directionOrder.push(opp)
        } else {
          let d1 = targetDirection + dist
          if (d1 > 8) d1 -= 8
          let d2 = targetDirection - dist
          if (d2 < 1) d2 += 8

          if (hashBool) {
            directionOrder.push(d1, d2)
          } else {
            directionOrder.push(d2, d1)
          }
        }
      }
    }
  } else {
    const offset = (Game.time + hash) % 8
    for (let i = 0; i < 8; i++) directionOrder.push(((i + offset) % 8) + 1)
  }

  const outOfWorkingArea = []

  for (const dir of directionOrder) {
    const delta = DIRECTIONS[dir]
    const coord = { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y }

    if (!isValidMove(coord, terrain, costs, movementCostThreshold)) continue

    const workingArea = getWorkingArea(creep)

    if (workingArea && workingArea.pos.getRangeTo(coord.x, coord.y) > workingArea.range) {
      outOfWorkingArea.push(coord)
      continue
    }

    possibleMoves.push(coord)
  }

  if (outOfWorkingArea.length > 0) {
    possibleMoves.push(...outOfWorkingArea)
  }

  creep._possibleMoves = possibleMoves

  return possibleMoves
}

/**
 * Determines if a creep can move.
 *
 * @param {Creep} creep - The creep to check.
 * @returns {boolean} - True if the creep can move, false otherwise.
 */
function canMove(creep) {
  if (creep._canMove !== undefined) {
    return creep._canMove
  }

  if (creep instanceof PowerCreep) {
    return (creep._canMove = true)
  }

  if (creep.fatigue > 0) {
    return (creep._canMove = false)
  }

  return (creep._canMove = creep.body.some((part) => part.type === MOVE))
}

/**
 * Checks if a move to a given coordinate is valid.
 *
 * @param {{x: number, y: number}} coord - The coordinate to check.
 * @param {RoomTerrain} terrain - The room's terrain data.
 * @param {CostMatrix} costs - The cost matrix.
 * @param {number} movementCostThreshold - Creeps will not move to tiles with cost greater than or equal to this value.
 * @returns {boolean} - True if the move is valid, false otherwise.
 */
function isValidMove(coord, terrain, costs, movementCostThreshold) {
  if (terrain.get(coord.x, coord.y) === TERRAIN_MASK_WALL) {
    return false
  }

  if (coord.x === 0 || coord.x === 49 || coord.y === 0 || coord.y === 49) {
    return false
  }

  if (costs && costs.get(coord.x, coord.y) >= movementCostThreshold) {
    return false
  }

  return true
}

/**
 * Assigns a creep to a specific coordinate.
 *
 * @param {Creep} creep - The creep to assign.
 * @param {{x: number, y: number}} coord - The coordinate to assign to the creep.
 * @param {Map<number, Creep>} movementMap - The movement map tracking occupied coordinates.
 */
function assignCreepToCoordinate(creep, coord, movementMap) {
  const packedCoord = packCoordinates(coord)
  creep._matchedPackedCoord = packedCoord
  movementMap.set(packedCoord, creep)
}

/**
 * Get the target coordinates when moving in a specific direction.
 *
 * @param {RoomPosition} pos - The current position.
 * @param {DirectionConstant} direction - The direction to move.
 * @returns {{x: number, y: number}} - The new coordinates after moving in the given direction.
 */
function getDirectionTarget(pos, direction) {
  const delta = DIRECTIONS[direction]
  const targetCoord = {
    x: Math.max(0, Math.min(49, pos.x + delta.x)),
    y: Math.max(0, Math.min(49, pos.y + delta.y)),
  }
  return targetCoord
}

/**
 * Retrieves the working area assigned to a creep.
 *
 * @param {Creep} creep - The creep whose working area is being retrieved.
 * @returns {{pos: RoomPosition, range: number} | null} - The working area or null if not assigned.
 */
function getWorkingArea(creep) {
  if (!creep._workingPos) {
    return null
  }

  return { pos: creep._workingPos, range: creep._workingRange || 0 }
}

/**
 * Gets the intended packed coordinate of a creep.
 *
 * @param {Creep} creep - The creep to retrieve the intended coordinate for.
 * @returns {number} - The packed coordinate or undefined if not set.
 */
function getIntendedPackedCoord(creep) {
  return creep._intendedPackedCoord
}

function getIntendedCoord(creep) {
  const intendedPackedCoord = getIntendedPackedCoord(creep)

  if (!intendedPackedCoord) {
    return null
  }

  return unpackCoordinates(intendedPackedCoord)
}

/**
 * Gets the matched packed coordinate of a creep.
 *
 * @param {Creep} creep - The creep to retrieve the matched coordinate for.
 * @returns {number} - The packed coordinate or undefined if not set.
 */
function getMatchedPackedCoord(creep) {
  return creep._matchedPackedCoord
}

/**
 * Deletes the matched packed coordinate of a creep.
 *
 * @param {Creep} creep - The creep whose matched coordinate should be removed.
 */
function deleteMatchedPackedCoord(creep) {
  delete creep._matchedPackedCoord
}

/**
 * Packs x and y coordinates into a single number.
 *
 * @param {{x: number, y: number}} coord - The coordinate to pack.
 * @returns {number} - The packed coordinate.
 */
function packCoordinates(coord) {
  return 50 * coord.y + coord.x
}

/**
 * Unpacks a packed coordinate into x and y components.
 *
 * @param {number} packedCoord - The packed coordinate to unpack.
 * @returns {{x: number, y: number}} - The unpacked coordinate.
 */
function unpackCoordinates(packedCoord) {
  const x = packedCoord % 50
  const y = (packedCoord - x) / 50
  return { x, y }
}

const trafficManager = {
  registerMove,
  setWorkingArea,
  run,
  getIntendedCoord,
}

module.exports = trafficManager
