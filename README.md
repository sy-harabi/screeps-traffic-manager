# Screeps Traffic Manager

## Overview

The **Screeps Traffic Manager** is an advanced movement management utility for the game **Screeps**. It employs a modified **Ford-Fulkerson algorithm** to optimize and maximize the movement efficiency of your creeps, reducing congestion and improving overall performance.

## Features

- **Optimized Traffic Management** – Uses a flow-based approach to resolve movement conflicts dynamically.
- **Near-Optimal Movements** – Provides an efficient solution to minimize movement conflicts.
- **Seamless Integration** – Works effortlessly with your existing Screeps codebase.
- **Cost-Based Movement Control** – Supports **CostMatrix** to fine-tune movement restrictions.

## Installation

To install **Screeps Traffic Manager**, include the module in your Screeps project and require it in your script:

```javascript
const trafficManager = require("screeps-traffic-manager")
```

## Usage

### 1. Register Move

Instead of using `Creep.move(direction)`, register a move request with:

```javascript
trafficManager.registerMove(creep, target)
```

#### Parameters:

- **`creep`** – The `Creep` or `PowerCreep` making the move.
- **`target`** – Either a `RoomPosition` (near the creep) or a `DirectionConstant`.

#### Example:

```javascript
// Using a direction
trafficManager.registerMove(myCreep, RIGHT)

// Using a RoomPosition (must be adjacent to the creep)
const targetPos = new RoomPosition(15, 10, "W1N1")
trafficManager.registerMove(myCreep, targetPos)
```

If you use monkey-patch version, you can skip this step.

### 2. Run Traffic Manager

At the end of your loop, for each room with active creeps, execute:

```javascript
trafficManager.run(room, costs, movementCostThreshold)
```

#### Parameters:

- **`room`** – The `Room` object where movement is managed.
- **`costs`** _(optional)_ – A `CostMatrix` for movement decisions.
- **`movementCostThreshold`** _(default: 255)_ – Creeps will avoid tiles with a cost equal to or greater than this value.

#### Example:

```javascript
for (const roomName in Game.rooms) {
  const room = Game.rooms[roomName]
  trafficManager.run(room)
}
```

💡 **Tip:** Ensure `trafficManager.run(room)` is executed in all rooms where your creeps operate to maintain movement consistency.

### 3. Custom Movement Rules

You can pass a `PathFinder.CostMatrix` and `movementCostThreshold` to `run()` to block certain areas. For instance, to make spaces near energy sources less desirable:

```javascript
const room = Game.rooms["W1N1"]
const costs = new PathFinder.CostMatrix()

room.find(FIND_SOURCES).forEach((source) => {
  for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
    for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
      costs.set(x, y, 255) // High cost discourages movement
    }
  }
})

trafficManager.run(room, costs)
```

You can also define a working area for a creep using:

```javascript
trafficManager.setWorkingArea(creep, pos, range)
```

#### Parameters:

- **`creep`** – The `Creep` or `PowerCreep` assigned the area.
- **`pos`** – The center `RoomPosition` of the working area.
- **`range`** – Maximum movement range from the center.

#### Example:

```javascript
upgraders.forEach((creep) => trafficManager.setWorkingArea(creep, controller.pos, 3))
```

### 4. Full Example

Integrate **Traffic Manager** into your main script as follows:

```javascript
// main.js
const trafficManager = require("screeps-traffic-manager")

module.exports.loop = function () {
  // Your game logic

  // Run traffic management
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName]
    trafficManager.run(room)
  }
}
```
