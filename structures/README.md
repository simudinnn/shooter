# Structures

Use npm start, open tools/map-editor.html and select **Građevina**. Draw floors, walls, doors, props, chests and optional fixed loot on a canvas up to 64 × 64 tiles. You can also Alt-drag a selection from an existing map and export only that selection as a structure. Choose a unique name and click **Spremi JSON** to save directly here. Existing names overwrite that structure.

The next Procedural map raid reloads this folder and places weighted, separated copies of its JSON templates. The world adds foliage, occasional trees, fog boundaries, player spawn and extraction hatches. Roads and towns are only present when authored in your structures. Player spawns and hatches inside templates are ignored. Saved maps in maps/ are unchanged.

The development server discovers JSON files automatically. For static hosting, update catalog.json with the structure filenames. Structure floor tiles are explicit; empty cells inherit the generated grass ground.
