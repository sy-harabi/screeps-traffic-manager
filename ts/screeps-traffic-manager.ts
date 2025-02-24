/**
 * Screeps Traffic Manager
 *
 * Manages creep movement to reduce congestion and improve pathing efficiency.
 *
 * This file is translated to ts from js version. But I'm not certain if it's done well. Tell me if there is something wrong.
 */

type Coord = { x: number; y: number }

type CreepType = Creep | PowerCreep

type MovementMap = Map<number, CreepType>

const DIRECTION_DELTA: Record<DirectionConstant, Coord> = {
  [TOP]: { x: 0, y: -1 },
  [TOP_RIGHT]: { x: 1, y: -1 },
  [RIGHT]: { x: 1, y: 0 },
  [BOTTOM_RIGHT]: { x: 1, y: 1 },
  [BOTTOM]: { x: 0, y: 1 },
  [BOTTOM_LEFT]: { x: -1, y: 1 },
  [LEFT]: { x: -1, y: 0 },
  [TOP_LEFT]: { x: -1, y: -1 },
}

function registerMove(creep: CreepType, target: RoomPosition | DirectionConstant): void {
  const targetCoord: Coord =
    typeof target === "number" ? getDirectionTarget(creep.pos, target) : { x: target.x, y: target.y }
  ;(creep as any)._intendedPackedCoord = packCoordinates(targetCoord)
}

function setWorkingArea(creep: CreepType, pos: RoomPosition, range: number): void {
  ;(creep as any)._workingPos = pos
  ;(creep as any)._workingRange = range
}

function run(room: Room, costs?: CostMatrix, movementCostThreshold: number = 255): void {
  const movementMap: MovementMap = new Map()
  const terrain = Game.map.getRoomTerrain(room.name)
  const creepsInRoom: CreepType[] = [...room.find(FIND_MY_CREEPS), ...room.find(FIND_MY_POWER_CREEPS)]

  creepsInRoom.forEach((creep) => assignCreepToCoordinate(creep, creep.pos, movementMap))

  for (const creep of creepsInRoom) {
    const intendedPackedCoord = getIntendedPackedCoord(creep)
    if (!intendedPackedCoord) continue

    const matchedPackedCoord = getMatchedPackedCoord(creep)
    if (matchedPackedCoord === intendedPackedCoord) continue

    const visitedCreeps = new Set<string>()
    movementMap.delete(matchedPackedCoord!)
    deleteMatchedPackedCoord(creep)

    if (depthFirstSearch(creep, 0, terrain, costs, movementCostThreshold, movementMap, visitedCreeps) > 0) continue

    assignCreepToCoordinate(creep, creep.pos, movementMap)
  }

  creepsInRoom.forEach((creep) => resolveMovement(creep))
}

function depthFirstSearch(
  creep: Creep,
  score: number = 0,
  terrain: RoomTerrain,
  costs: CostMatrix | undefined,
  movementCostThreshold: number,
  movementMap: MovementMap,
  visitedCreeps: Set<string>,
): number {
  visitedCreeps.add(creep.name)
  if (!creep.my) return -Infinity

  const emptyTiles: Coord[] = []
  const occupiedTiles: Coord[] = []

  for (const coord of getPossibleMoves(creep, terrain, costs, movementCostThreshold)) {
    const occupied = movementMap.get(packCoordinates(coord))
    occupied ? occupiedTiles.push(coord) : emptyTiles.push(coord)
  }

  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    const packedCoord = packCoordinates(coord)
    if (getIntendedPackedCoord(creep) === packedCoord) score++

    const occupyingCreep = movementMap.get(packedCoord)
    if (!occupyingCreep) {
      if (score > 0) assignCreepToCoordinate(creep, coord, movementMap)
      return score
    }

    if (!visitedCreeps.has(occupyingCreep.name)) {
      if (getIntendedPackedCoord(occupyingCreep) === packedCoord) score--
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

function resolveMovement(creep: Creep): void {
  const matchedPos = unpackCoordinates(getMatchedPackedCoord(creep)!)
  if (!creep.pos.isEqualTo(matchedPos.x, matchedPos.y)) {
    creep.move(creep.pos.getDirectionTo(matchedPos.x, matchedPos.y))
  }
}

function getPossibleMoves(
  creep: Creep,
  terrain: RoomTerrain,
  costs: CostMatrix | undefined,
  movementCostThreshold: number,
): Coord[] {
  if ((creep as any)._possibleMoves) return (creep as any)._possibleMoves
  if (!canMove(creep)) return []

  const possibleMoves: Coord[] = []
  const intendedPackedCoord = getIntendedPackedCoord(creep)
  if (intendedPackedCoord) return [unpackCoordinates(intendedPackedCoord)]

  for (const delta of Object.values(DIRECTION_DELTA).sort(() => Math.random() - 0.5)) {
    const coord = { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y }
    if (isValidMove(coord, terrain, costs, movementCostThreshold)) possibleMoves.push(coord)
  }

  ;(creep as any)._possibleMoves = possibleMoves
  return possibleMoves
}

function assignCreepToCoordinate(creep: CreepType, coord: Coord, movementMap: MovementMap): void {
  const packedCoord = packCoordinates(coord)
  ;(creep as any)._matchedPackedCoord = packedCoord
  movementMap.set(packedCoord, creep)
}

function getIntendedPackedCoord(creep: Creep): number | undefined {
  return (creep as any)._intendedPackedCoord
}

function getMatchedPackedCoord(creep: Creep): number | undefined {
  return (creep as any)._matchedPackedCoord
}

function deleteMatchedPackedCoord(creep: Creep): void {
  delete (creep as any)._matchedPackedCoord
}

function packCoordinates(coord: Coord): number {
  return 50 * coord.y + coord.x
}

function unpackCoordinates(packedCoord: number): Coord {
  return { x: packedCoord % 50, y: Math.floor(packedCoord / 50) }
}

const trafficManager = { registerMove, setWorkingArea, run }
export default trafficManager
