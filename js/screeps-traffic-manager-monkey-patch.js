/**
 * Screeps Traffic Manager
 *
 * Manages creep movement to reduce congestion and improve pathing efficiency.
 *
 * With this version, you don't need to registerMove() on your own. Just call trafficManager.run() for every room at the end of the loop.
 */

const DIRECTION_DELTA = {
  [TOP]: { x: 0, y: -1 },
  [TOP_RIGHT]: { x: 1, y: -1 },
  [RIGHT]: { x: 1, y: 0 },
  [BOTTOM_RIGHT]: { x: 1, y: 1 },
  [BOTTOM]: { x: 0, y: 1 },
  [BOTTOM_LEFT]: { x: -1, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [TOP_LEFT]: { x: -1, y: -1 },
}

if (!Creep.prototype._move) {
  Creep.prototype._move = Creep.prototype.move

  Creep.prototype.move = function (direciton) {
    registerMove(this, direciton)
  }
}

/**
 * Registers the intended move for a creep.
 *
 * @param {Creep|PowerCreep} creep - The creep whose movement is being registered.
 * @param {RoomPosition|DirectionConstant} target - The target position or movement direction.
 */
function registerMove(creep, target) {
  let targetCoord = typeof target === "number" ? getDirectionTarget(creep.pos, target) : target

  creep._intendedPackedCoord = packCoordinates(targetCoord)
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

    if (depthFirstSearch(creep, 0, terrain, costs, movementCostThreshold, movementMap, visitedCreeps) > 0) continue

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
function depthFirstSearch(creep, score = 0, terrain, costs, movementCostThreshold, movementMap, visitedCreeps) {
  visitedCreeps.add(creep.name)

  if (!creep.my) {
    return -Infinity
  }

  const emptyTiles = []

  const occupiedTiles = []

  for (const coord of getPossibleMoves(creep, terrain, costs, movementCostThreshold)) {
    const occupied = movementMap.get(packCoordinates(coord))

    if (occupied) {
      occupiedTiles.push(coord)
    } else {
      emptyTiles.push(coord)
    }
  }

  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    const packedCoord = packCoordinates(coord)

    if (getIntendedPackedCoord(creep) === packedCoord) {
      score++
    }

    const occupyingCreep = movementMap.get(packedCoord)

    if (!occupyingCreep) {
      if (score > 0) {
        assignCreepToCoordinate(creep, coord, movementMap)
      }
      return score
    }

    if (!visitedCreeps.has(occupyingCreep.name)) {
      if (getIntendedPackedCoord(occupyingCreep) === packedCoord) {
        score--
      }

      const result = depthFirstSearch(
        occupyingCreep,
        score,
        terrain,
        costs,
        movementCostThreshold,
        movementMap,
        visitedCreeps,
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
    creep._move(creep.pos.getDirectionTo(matchedPos.x, matchedPos.y))
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

  if (intendedPackedCoord) {
    possibleMoves.push(unpackCoordinates(intendedPackedCoord))
    creep._possibleMoves = possibleMoves
    return possibleMoves
  }

  const outOfWorkingArea = []

  for (const delta of Object.values(DIRECTION_DELTA).sort((a, b) => Math.random() - 0.5)) {
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
function getDirectionTarget(pos, direciton) {
  const delta = DIRECTION_DELTA[direciton]
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
  run,
}

module.exports = trafficManager
