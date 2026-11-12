export default {
  "shop": [
    {
      "level": 1,
      "price": 20,
      "item": {
        "kind": "ammo",
        "ammoType": "pistol",
        "amount": 24
      }
    },
    {
      "level": 1,
      "price": 15,
      "item": {
        "kind": "consumable",
        "key": "bandage",
        "amount": 2
      }
    },
    {
      "level": 4,
      "price": 32,
      "item": {
        "kind": "ammo",
        "ammoType": "shotgun",
        "amount": 12
      }
    },
    {
      "level": 8,
      "price": 44,
      "item": {
        "kind": "ammo",
        "ammoType": "rifle",
        "amount": 30
      }
    },
    {
      "level": 12,
      "price": 52,
      "item": {
        "kind": "ammo",
        "ammoType": "sniper",
        "amount": 12
      }
    },
    {
      "level": 2,
      "price": 25,
      "item": {
        "kind": "material",
        "key": "cloth",
        "amount": 5
      }
    },
    {
      "level": 3,
      "price": 30,
      "item": {
        "kind": "material",
        "key": "metal",
        "amount": 5
      }
    },
    {
      "level": 5,
      "price": 38,
      "item": {
        "kind": "material",
        "key": "chemicals",
        "amount": 4
      }
    },
    {
      "level": 8,
      "price": 48,
      "item": {
        "kind": "material",
        "key": "repair_kit",
        "amount": 1
      }
    },
    {
      "level": 5,
      "price": 48,
      "item": {
        "kind": "melee",
        "key": "wooden_bat"
      }
    },
    {
      "level": 4,
      "price": 125,
      "item": {
        "kind": "weapon",
        "key": "glock",
        "ammo": 12
      }
    },
    {
      "level": 3,
      "price": 115,
      "item": {
        "kind": "equipment",
        "key": "backpack_1"
      }
    },
    {
      "level": 5,
      "price": 140,
      "item": {
        "kind": "equipment",
        "key": "vest"
      }
    },
    {
      "item": {
        "kind": "material",
        "key": "upgrade_kit",
        "amount": 1
      },
      "price": 175,
      "level": 12
    },
    {
      "item": {
        "kind": "weapon",
        "key": "revolver"
      },
      "price": 175,
      "level": 6
    },
    {
      "item": {
        "kind": "weapon",
        "key": "uzi"
      },
      "price": 240,
      "level": 10
    },
    {
      "item": {
        "kind": "weapon",
        "key": "m870"
      },
      "price": 290,
      "level": 12
    },
    {
      "item": {
        "kind": "weapon",
        "key": "m16"
      },
      "price": 380,
      "level": 16
    },
    {
      "item": {
        "kind": "weapon",
        "key": "famas"
      },
      "price": 420,
      "level": 19
    },
    {
      "item": {
        "kind": "weapon",
        "key": "fal"
      },
      "price": 475,
      "level": 22
    },
    {
      "item": {
        "kind": "weapon",
        "key": "m24"
      },
      "price": 525,
      "level": 24
    },
    {
      "item": {
        "kind": "throwable",
        "key": "grenade"
      },
      "price": 70,
      "level": 10
    },
    {
      "item": {
        "kind": "throwable",
        "key": "molotov"
      },
      "price": 58,
      "level": 7
    },
    {
      "item": {
        "kind": "throwable",
        "key": "flare"
      },
      "price": 36,
      "level": 4
    },
    {
      "item": {
        "kind": "equipment",
        "key": "hunting_vest"
      },
      "price": 185,
      "level": 8
    },
    {
      "item": {
        "kind": "equipment",
        "key": "police_vest"
      },
      "price": 275,
      "level": 14
    },
    {
      "item": {
        "kind": "equipment",
        "key": "military_vest"
      },
      "price": 430,
      "level": 22
    },
    {
      "item": {
        "kind": "equipment",
        "key": "backpack2"
      },
      "price": 250,
      "level": 12
    },
    {
      "item": {
        "kind": "equipment",
        "key": "backpack3"
      },
      "price": 420,
      "level": 21
    }
  ],
  "crafting": [
    {
      "id": "plank",
      "output": {
        "kind": "material",
        "key": "plank",
        "amount": 1
      },
      "costs": {
        "wood": 3
      },
      "level": 1
    },
    {
      "id": "metal_sheet",
      "output": {
        "kind": "material",
        "key": "metal_sheet",
        "amount": 1
      },
      "costs": {
        "metal": 3
      },
      "level": 1
    },
    {
      "id": "metal_pipe",
      "output": {
        "kind": "material",
        "key": "metal_pipe",
        "amount": 1
      },
      "costs": {
        "metal": 3,
        "tape": 1
      },
      "level": 1
    },
    {
      "id": "copper_coil",
      "output": {
        "kind": "material",
        "key": "copper_coil",
        "amount": 1
      },
      "costs": {
        "wires": 3,
        "tape": 1
      },
      "level": 4
    },
    {
      "id": "glass_bottle",
      "output": {
        "kind": "material",
        "key": "glass_bottle",
        "amount": 1
      },
      "costs": {
        "glass": 3
      },
      "level": 1
    },
    {
      "id": "adhesive",
      "output": {
        "kind": "material",
        "key": "adhesive",
        "amount": 1
      },
      "costs": {
        "chemicals": 2,
        "rubber": 1
      },
      "level": 1
    },
    {
      "id": "bandage",
      "output": {
        "kind": "consumable",
        "key": "bandage",
        "amount": 1
      },
      "costs": {
        "cloth": 2,
        "adhesive": 1
      },
      "level": 1
    },
    {
      "id": "pistol_ammo",
      "output": {
        "kind": "ammo",
        "ammoType": "pistol",
        "amount": 12
      },
      "costs": {
        "metal": 2,
        "chemicals": 1
      },
      "level": 1
    },
    {
      "id": "shotgun_ammo",
      "output": {
        "kind": "ammo",
        "ammoType": "shotgun",
        "amount": 6
      },
      "costs": {
        "metal": 2,
        "chemicals": 1,
        "plastic": 1
      },
      "level": 1
    },
    {
      "id": "rifle_ammo",
      "output": {
        "kind": "ammo",
        "ammoType": "rifle",
        "amount": 15
      },
      "costs": {
        "metal": 3,
        "chemicals": 2
      },
      "level": 4
    },
    {
      "id": "sniper_ammo",
      "output": {
        "kind": "ammo",
        "ammoType": "sniper",
        "amount": 6
      },
      "costs": {
        "metal": 3,
        "chemicals": 2,
        "plastic": 2
      },
      "level": 8
    },
    {
      "id": "spring",
      "output": {
        "kind": "material",
        "key": "spring",
        "amount": 1
      },
      "costs": {
        "metal": 3
      },
      "level": 1
    },
    {
      "id": "mechanical_comp",
      "output": {
        "kind": "material",
        "key": "mechanical_comp",
        "amount": 1
      },
      "costs": {
        "metal": 3,
        "spring": 2
      },
      "level": 3
    },
    {
      "id": "electrical_comp",
      "output": {
        "kind": "material",
        "key": "electrical_comp",
        "amount": 1
      },
      "costs": {
        "plastic": 3,
        "microchip": 3
      },
      "level": 5
    },
    {
      "id": "repair_kit",
      "output": {
        "kind": "material",
        "key": "repair_kit",
        "amount": 1
      },
      "costs": {
        "metal": 3,
        "tape": 2,
        "adhesive": 2
      },
      "level": 5
    },
    {
      "id": "sewing_kit",
      "output": {
        "kind": "material",
        "key": "sewing_kit",
        "amount": 1
      },
      "costs": {
        "cloth": 3,
        "rope": 2,
        "fabric": 3
      },
      "level": 4
    },
    {
      "id": "splint_kit",
      "output": {
        "kind": "material",
        "key": "splint_kit",
        "amount": 1
      },
      "costs": {
        "plank": 3,
        "tape": 2
      },
      "level": 1
    },
    {
      "id": "fabric",
      "output": {
        "kind": "material",
        "key": "fabric",
        "amount": 1
      },
      "costs": {
        "cloth": 2
      },
      "level": 1
    },
    {
      "id": "fuel",
      "output": {
        "kind": "material",
        "key": "fuel",
        "amount": 1
      },
      "costs": {
        "plastic": 3,
        "chemicals": 3
      },
      "level": 3
    },
    {
      "id": "battery",
      "output": {
        "kind": "material",
        "key": "battery",
        "amount": 1
      },
      "costs": {
        "metal": 2,
        "chemicals": 3
      },
      "level": 1
    },
    {
      "id": "glock",
      "output": {
        "kind": "weapon",
        "key": "glock"
      },
      "costs": {
        "gun_parts": 1,
        "metal": 3,
        "spring": 1
      },
      "level": 6
    },
    {
      "id": "knife",
      "output": {
        "kind": "melee",
        "key": "knife"
      },
      "costs": {
        "metal": 2
      },
      "level": 1
    },
    {
      "id": "wooden_bat",
      "output": {
        "kind": "melee",
        "key": "wooden_bat"
      },
      "costs": {
        "plank": 2,
        "tape": 1
      },
      "level": 1
    },
    {
      "id": "crowbar",
      "output": {
        "kind": "melee",
        "key": "crowbar"
      },
      "costs": {
        "metal": 3,
        "metal_pipe": 1
      },
      "level": 4
    },
    {
      "id": "fire_axe",
      "output": {
        "kind": "melee",
        "key": "fire_axe"
      },
      "costs": {
        "metal": 3,
        "plank": 2,
        "mechanical_comp": 1
      },
      "level": 8
    },
    {
      "id": "vest",
      "output": {
        "kind": "equipment",
        "key": "vest"
      },
      "costs": {
        "fabric": 3,
        "cloth": 2,
        "tape": 1
      },
      "level": 7
    },
    {
      "id": "tool_belt",
      "output": {
        "kind": "equipment",
        "key": "tool_belt"
      },
      "costs": {
        "fabric": 2,
        "cloth": 3,
        "metal": 2,
        "tape": 2
      },
      "level": 5
    },
    {
      "id": "backpack_1",
      "output": {
        "kind": "equipment",
        "key": "backpack_1"
      },
      "costs": {
        "cloth": 4,
        "rope": 2,
        "fabric": 2
      },
      "level": 4
    }
  ],
  "recycling": {
    "items": {
      "equipment.backpack_1": [
        {
          "key": "cloth",
          "amount": 2
        },
        {
          "key": "rope",
          "amount": 1
        }
      ],
      "equipment.backpack2": [
        {
          "key": "fabric",
          "amount": 2
        },
        {
          "key": "rope",
          "amount": 1
        }
      ],
      "equipment.backpack3": [
        {
          "key": "fabric",
          "amount": 3
        },
        {
          "key": "rubber",
          "amount": 2
        }
      ],
      "equipment.tool_belt": [
        {
          "key": "cloth",
          "amount": 2
        },
        {
          "key": "metal",
          "amount": 1
        }
      ],
      "equipment.vest": [
        {
          "key": "fabric",
          "amount": 1
        },
        {
          "key": "cloth",
          "amount": 1
        }
      ],
      "equipment.hunting_vest": [
        {
          "key": "fabric",
          "amount": 2
        },
        {
          "key": "cloth",
          "amount": 1
        }
      ],
      "equipment.police_vest": [
        {
          "key": "fabric",
          "amount": 2
        },
        {
          "key": "metal_sheet",
          "amount": 1
        }
      ],
      "equipment.military_vest": [
        {
          "key": "fabric",
          "amount": 3
        },
        {
          "key": "metal_sheet",
          "amount": 2
        }
      ]
    },
    "weapon": [
      {
        "key": "metal",
        "amount": 2
      },
      {
        "key": "gun_parts",
        "amount": 1
      },
      {
        "key": "spring",
        "amount": 1
      }
    ],
    "melee": [
      {
        "key": "metal",
        "amount": 1
      },
      {
        "key": "wood",
        "amount": 2
      }
    ],
    "bandage": [
      {
        "key": "cloth",
        "amount": 1
      }
    ],
    "ammo": [
      {
        "key": "metal",
        "amount": 1
      }
    ],
    "material": {
      "plank": [
        {
          "key": "wood",
          "amount": 1
        }
      ],
      "metal_sheet": [
        {
          "key": "metal",
          "amount": 1
        }
      ],
      "metal_pipe": [
        {
          "key": "metal",
          "amount": 1
        }
      ],
      "copper_coil": [
        {
          "key": "wires",
          "amount": 1
        }
      ],
      "stick": [
        {
          "key": "wood",
          "amount": 1
        }
      ],
      "tape": [
        {
          "key": "adhesive",
          "amount": 1
        }
      ],
      "repair_kit": [
        {
          "key": "metal",
          "amount": 2
        },
        {
          "key": "tape",
          "amount": 1
        }
      ],
      "sewing_kit": [
        {
          "key": "cloth",
          "amount": 2
        },
        {
          "key": "rope",
          "amount": 1
        }
      ],
      "splint_kit": [
        {
          "key": "plank",
          "amount": 1
        },
        {
          "key": "cloth",
          "amount": 1
        }
      ],
      "upgrade_kit": [
        {
          "key": "metal",
          "amount": 2
        },
        {
          "key": "mechanical_comp",
          "amount": 1
        }
      ],
      "mechanical_comp": [
        {
          "key": "metal",
          "amount": 2
        },
        {
          "key": "spring",
          "amount": 1
        }
      ],
      "electrical_comp": [
        {
          "key": "plastic",
          "amount": 2
        },
        {
          "key": "microchip",
          "amount": 1
        }
      ],
      "electrical_trans": [
        {
          "key": "electrical_comp",
          "amount": 1
        },
        {
          "key": "wires",
          "amount": 1
        },
        {
          "key": "metal",
          "amount": 2
        }
      ],
      "fabric": [
        {
          "key": "cloth",
          "amount": 1
        }
      ],
      "fuel": [
        {
          "key": "plastic",
          "amount": 2
        },
        {
          "key": "chemicals",
          "amount": 2
        }
      ],
      "glass_bottle": [
        {
          "key": "glass",
          "amount": 2
        }
      ],
      "gun_parts": [
        {
          "key": "metal",
          "amount": 2
        },
        {
          "key": "spring",
          "amount": 1
        }
      ],
      "military_comp": [
        {
          "key": "electrical_comp",
          "amount": 2
        },
        {
          "key": "wires",
          "amount": 2
        },
        {
          "key": "metal",
          "amount": 3
        }
      ],
      "nails": [
        {
          "key": "metal",
          "amount": 2
        }
      ],
      "spring": [
        {
          "key": "metal",
          "amount": 2
        }
      ],
      "battery": [
        {
          "key": "metal",
          "amount": 1
        },
        {
          "key": "chemicals",
          "amount": 2
        }
      ],
      "rope": [
        {
          "key": "cloth",
          "amount": 1
        }
      ],
      "wires": [
        {
          "key": "metal",
          "amount": 1
        }
      ]
    }
  },
  "economy": {
    "startingCash": 85,
    "materialSellCash": 1,
    "ammoRecycleBatch": 8
  },
  "recycleLevels": {
    "material.upgrade_kit": 6,
    "material.military_comp": 8
  },
  "sellPrices": {
    "material": {
      "cloth": 2,
      "metal": 2,
      "plank": 2,
      "tape": 2,
      "rope": 2,
      "wires": 2,
      "glass": 2,
      "fabric": 3,
      "fuel": 10,
      "chemicals": 2,
      "battery": 4,
      "spring": 3,
      "rubber": 2,
      "metal_sheet": 30,
      "metal_pipe": 50,
      "copper_coil": 40,
      "microchip": 4,
      "gun_parts": 20,
      "mechanical_comp": 25,
      "electrical_comp": 16,
      "electrical_trans": 90,
      "repair_kit": 8,
      "sewing_kit": 8,
      "splint_kit": 5,
      "military_comp": 130,
      "blueprint_old": 8,
      "blueprint": 14,
      "upgrade_kit": 24
    },
    "equipment": {
      "backpack_1": 14,
      "backpack2": 48,
      "backpack3": 85,
      "tool_belt": 12,
      "vest": 14,
      "hunting_vest": 32,
      "police_vest": 55,
      "military_vest": 90
    },
    "weapon": {
      "glock": 17,
      "revolver": 30,
      "uzi": 42,
      "m870": 50,
      "m16": 70,
      "famas": 80,
      "fal": 92,
      "m24": 105
    },
    "melee": {
      "knife": 4,
      "wooden_bat": 6,
      "crowbar": 10,
      "fire_axe": 25
    }
  }
};
