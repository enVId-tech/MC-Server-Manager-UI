/**
 * Names that console commands take. An entry can carry the version it came in and the one it left, as
 * `name@1.19` (since 1.19) and `name@1.13~1.16.5` (from 1.13 up to and including 1.16.5). The lists are what a
 * person usually types, not every registry entry of every version; anything can still be typed by hand.
 */

export const SELECTOR_LIST = ['@a', '@e', '@p', '@r', '@s', '@n@1.21'];

export const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];
export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
export const DIMENSIONS = ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'];

export const BLOCKS = `air stone granite diorite andesite deepslate@1.17 cobblestone cobbled_deepslate@1.17 dirt grass_block podzol mycelium coarse_dirt rooted_dirt@1.17 mud@1.19 clay gravel sand red_sand sandstone red_sandstone
oak_planks spruce_planks birch_planks jungle_planks acacia_planks dark_oak_planks mangrove_planks@1.19 cherry_planks@1.20 bamboo_planks@1.20 crimson_planks@1.16 warped_planks@1.16 pale_oak_planks@1.21.4
oak_log spruce_log birch_log jungle_log acacia_log dark_oak_log mangrove_log@1.19 cherry_log@1.20 crimson_stem@1.16 warped_stem@1.16 oak_leaves spruce_leaves birch_leaves jungle_leaves acacia_leaves dark_oak_leaves azalea_leaves@1.17
glass white_stained_glass glass_pane tinted_glass@1.17 bricks stone_bricks mossy_stone_bricks cracked_stone_bricks chiseled_stone_bricks deepslate_bricks@1.17 nether_bricks red_nether_bricks end_stone end_stone_bricks purpur_block prismarine prismarine_bricks dark_prismarine sea_lantern
bedrock obsidian crying_obsidian@1.16 netherrack soul_sand soul_soil@1.16 basalt@1.16 blackstone@1.16 glowstone shroomlight@1.16 magma_block nether_wart_block warped_wart_block@1.16 ancient_debris@1.16 netherite_block@1.16
coal_ore iron_ore copper_ore@1.17 gold_ore redstone_ore lapis_ore diamond_ore emerald_ore nether_gold_ore@1.16 nether_quartz_ore deepslate_coal_ore@1.17 deepslate_iron_ore@1.17 deepslate_diamond_ore@1.17
coal_block iron_block copper_block@1.17 gold_block redstone_block lapis_block diamond_block emerald_block quartz_block amethyst_block@1.17 raw_iron_block@1.17 raw_copper_block@1.17 raw_gold_block@1.17
white_wool orange_wool magenta_wool light_blue_wool yellow_wool lime_wool pink_wool gray_wool light_gray_wool cyan_wool purple_wool blue_wool brown_wool green_wool red_wool black_wool
white_concrete orange_concrete magenta_concrete light_blue_concrete yellow_concrete lime_concrete pink_concrete gray_concrete light_gray_concrete cyan_concrete purple_concrete blue_concrete brown_concrete green_concrete red_concrete black_concrete
white_terracotta terracotta white_concrete_powder
water lava ice packed_ice blue_ice snow snow_block powder_snow@1.17 cobweb sponge wet_sponge slime_block honey_block@1.15 hay_block bookshelf chiseled_bookshelf@1.20 tnt cactus pumpkin carved_pumpkin jack_o_lantern melon sculk@1.19 sculk_sensor@1.17 sculk_shrieker@1.19 moss_block@1.17 dripstone_block@1.17 calcite@1.17 tuff@1.17 budding_amethyst@1.17
oak_slab stone_slab cobblestone_slab oak_stairs stone_stairs cobblestone_stairs oak_fence oak_fence_gate cobblestone_wall oak_door iron_door oak_trapdoor iron_trapdoor oak_button stone_button oak_pressure_plate stone_pressure_plate oak_sign
torch soul_torch@1.16 lantern soul_lantern@1.16 campfire@1.14 soul_campfire@1.16 redstone_lamp ladder scaffolding@1.14 rail powered_rail detector_rail activator_rail chain@1.16 iron_bars
crafting_table furnace blast_furnace@1.14 smoker@1.14 chest trapped_chest ender_chest barrel@1.14 shulker_box anvil enchanting_table brewing_stand cauldron beacon conduit@1.13 lectern@1.14 grindstone@1.14 smithing_table@1.14 loom@1.14 stonecutter@1.14 cartography_table@1.14 fletching_table@1.14 composter@1.14 bell@1.14 respawn_anchor@1.16 lodestone@1.16 end_portal_frame spawner dragon_egg white_bed
redstone_torch redstone_wire repeater comparator observer@1.11 piston sticky_piston dispenser dropper hopper lever tripwire_hook note_block jukebox daylight_detector target@1.16 lightning_rod@1.17 sculk_catalyst@1.19
farmland wheat beetroots carrots potatoes sugar_cane bamboo@1.14 kelp@1.13 sweet_berry_bush@1.14 cocoa vine glow_lichen@1.17 lily_pad dandelion poppy azure_bluet cornflower lily_of_the_valley wither_rose@1.14 sunflower lilac rose_bush peony torchflower@1.20 pitcher_plant@1.20 sniffer_egg@1.20
command_block chain_command_block repeating_command_block structure_block structure_void barrier light@1.17 jigsaw@1.14 debug_stick`.split(/\s+/);

export const ITEM_ONLY = `apple golden_apple enchanted_golden_apple bread cooked_beef cooked_porkchop cooked_chicken cooked_mutton cooked_salmon cooked_cod baked_potato carrot golden_carrot beetroot melon_slice sweet_berries@1.14 glow_berries@1.17 pumpkin_pie cake cookie honey_bottle@1.15 mushroom_stew rabbit_stew beef porkchop chicken mutton rabbit salmon cod rotten_flesh spider_eye
stick coal charcoal iron_ingot gold_ingot copper_ingot@1.17 netherite_ingot@1.16 netherite_scrap@1.16 raw_iron@1.17 raw_copper@1.17 raw_gold@1.17 diamond emerald lapis_lazuli quartz redstone amethyst_shard@1.17 flint string feather leather paper book writable_book written_book enchanted_book name_tag saddle lead bone bone_meal gunpowder blaze_rod blaze_powder ghast_tear ender_pearl ender_eye slime_ball nether_star shulker_shell phantom_membrane@1.13 prismarine_shard prismarine_crystals glowstone_dust glass_bottle experience_bottle firework_rocket firework_star
wooden_sword stone_sword iron_sword golden_sword diamond_sword netherite_sword@1.16 wooden_pickaxe stone_pickaxe iron_pickaxe golden_pickaxe diamond_pickaxe netherite_pickaxe@1.16 wooden_axe stone_axe iron_axe golden_axe diamond_axe netherite_axe@1.16 wooden_shovel stone_shovel iron_shovel golden_shovel diamond_shovel netherite_shovel@1.16 wooden_hoe stone_hoe iron_hoe golden_hoe diamond_hoe netherite_hoe@1.16 shears flint_and_steel fishing_rod carrot_on_a_stick warped_fungus_on_a_stick@1.16 compass clock spyglass@1.17 brush@1.20 bow crossbow@1.14 arrow spectral_arrow tipped_arrow trident@1.13 shield elytra totem_of_undying mace@1.21 wind_charge@1.21 fire_charge snowball egg
leather_helmet leather_chestplate leather_leggings leather_boots chainmail_helmet chainmail_chestplate chainmail_leggings chainmail_boots iron_helmet iron_chestplate iron_leggings iron_boots golden_helmet golden_chestplate golden_leggings golden_boots diamond_helmet diamond_chestplate diamond_leggings diamond_boots netherite_helmet@1.16 netherite_chestplate@1.16 netherite_leggings@1.16 netherite_boots@1.16 turtle_helmet@1.13
bucket water_bucket lava_bucket milk_bucket powder_snow_bucket@1.17 axolotl_bucket@1.17 minecart chest_minecart hopper_minecart tnt_minecart furnace_minecart oak_boat oak_chest_boat@1.19.3 map filled_map potion splash_potion lingering_potion
iron_horse_armor golden_horse_armor diamond_horse_armor music_disc_13 music_disc_cat music_disc_pigstep@1.16 disc_fragment_5@1.19 goat_horn@1.19 recovery_compass@1.19 echo_shard@1.19 knowledge_book zombie_spawn_egg creeper_spawn_egg villager_spawn_egg`.split(/\s+/);

export const ENTITIES = `allay@1.19 area_effect_cloud armadillo@1.20.5 armor_stand arrow axolotl@1.17 bat bee@1.15 blaze bogged@1.21 breeze@1.21 camel@1.20 cat chicken cod cow creeper dolphin@1.13 donkey drowned@1.13 elder_guardian ender_dragon enderman endermite evoker experience_orb falling_block fireball firework_rocket fox@1.14 frog@1.19 ghast giant glow_squid@1.17 goat@1.17 guardian hoglin@1.16 horse husk illusioner iron_golem item item_frame lightning_bolt llama magma_cube marker@1.17 minecart mooshroom mule ocelot painting panda@1.14 parrot phantom@1.13 pig piglin@1.16 piglin_brute@1.16 pillager@1.14 polar_bear puffer_fish rabbit ravager@1.14 salmon sheep shulker silverfish skeleton skeleton_horse slime sniffer@1.20 snow_golem spider squid stray strider@1.16 tadpole@1.19 text_display@1.19.4 block_display@1.19.4 item_display@1.19.4 interaction@1.19.4 tnt trader_llama@1.14 tropical_fish turtle@1.13 vex villager vindicator wandering_trader@1.14 warden@1.19 witch wither wither_skeleton wolf zoglin@1.16 zombie zombie_horse zombie_villager zombified_piglin@1.16 pig_zombie@~1.15.2`.split(/\s+/);

export const EFFECTS = `speed slowness haste mining_fatigue strength instant_health instant_damage jump_boost nausea regeneration resistance fire_resistance water_breathing invisibility blindness night_vision hunger weakness poison wither health_boost absorption saturation glowing levitation luck unluck slow_falling@1.13 conduit_power@1.13 dolphins_grace@1.13 bad_omen@1.14 hero_of_the_village@1.14 darkness@1.19 trial_omen@1.21 raid_omen@1.21 wind_charged@1.21 weaving@1.21 oozing@1.21 infested@1.21`.split(/\s+/);

export const ENCHANTMENTS = `protection fire_protection feather_falling blast_protection projectile_protection respiration aqua_affinity thorns depth_strider frost_walker@1.9 binding_curse@1.11 soul_speed@1.16 swift_sneak@1.19 sharpness smite bane_of_arthropods knockback fire_aspect looting sweeping_edge@1.11.1 efficiency silk_touch unbreaking fortune power punch flame infinity luck_of_the_sea lure loyalty@1.13 impaling@1.13 riptide@1.13 channeling@1.13 multishot@1.14 quick_charge@1.14 piercing@1.14 mending vanishing_curse@1.11 density@1.21 breach@1.21 wind_burst@1.21`.split(/\s+/);

export const GAMERULES_BOOLEAN = `announceAdvancements commandBlockOutput disableElytraMovementCheck doDaylightCycle doEntityDrops doFireTick doLimitedCrafting doMobLoot doMobSpawning doTileDrops doWeatherCycle keepInventory logAdminCommands mobGriefing naturalRegeneration reducedDebugInfo sendCommandFeedback showDeathMessages spectatorsGenerateChunks disableRaids@1.14.3 doInsomnia@1.15 doImmediateRespawn@1.15 drowningDamage@1.15 fallDamage@1.15 fireDamage@1.15 doPatrolSpawning@1.14 doTraderSpawning@1.14 forgiveDeadPlayers@1.16 universalAnger@1.16 freezeDamage@1.17 doWardenSpawning@1.19 blockExplosionDropDecay@1.21 mobExplosionDropDecay@1.21 tntExplosionDropDecay@1.21 waterSourceConversion@1.19.3 lavaSourceConversion@1.19.3 globalSoundEvents@1.19.4 doVinesSpread@1.19.4 enderPearlsVanishOnDeath@1.21.2 projectilesCanBreakBlocks@1.21.2`.split(/\s+/);

export const GAMERULES_NUMBER = `maxEntityCramming randomTickSpeed spawnRadius@1.13 maxCommandChainLength@1.12 playersSleepingPercentage@1.17 snowAccumulationHeight@1.17 commandModificationBlockLimit@1.19.4 playersNetherPortalDefaultDelay@1.21.2 playersNetherPortalCreativeDelay@1.21.2`.split(/\s+/);

export const STRUCTURES = `village@~1.18.2 mansion@~1.18.2 monument@~1.18.2 stronghold@~1.18.2 fortress@~1.18.2 mineshaft@~1.18.2 shipwreck@~1.18.2 temple@~1.18.2 bastion_remnant@1.16~1.18.2 buried_treasure@~1.18.2 desert_pyramid@~1.18.2 endcity@~1.18.2 igloo@~1.18.2 jungle_pyramid@~1.18.2 ocean_ruin@~1.18.2 pillager_outpost@~1.18.2 ruined_portal@~1.18.2 swamp_hut@~1.18.2`.split(/\s+/);
export const STRUCTURES_NEW = `minecraft:village_plains minecraft:village_desert minecraft:village_savanna minecraft:village_snowy minecraft:village_taiga minecraft:mansion minecraft:monument minecraft:stronghold minecraft:fortress minecraft:mineshaft minecraft:shipwreck minecraft:buried_treasure minecraft:desert_pyramid minecraft:end_city minecraft:igloo minecraft:jungle_pyramid minecraft:ocean_ruin_cold minecraft:ocean_ruin_warm minecraft:pillager_outpost minecraft:ruined_portal minecraft:swamp_hut minecraft:bastion_remnant minecraft:ancient_city@1.19 minecraft:trail_ruins@1.20 minecraft:trial_chambers@1.21 #minecraft:village #minecraft:ocean_ruin`.split(/\s+/);

export const BIOMES = `minecraft:plains minecraft:desert minecraft:forest minecraft:taiga minecraft:swamp minecraft:jungle minecraft:savanna minecraft:badlands minecraft:snowy_plains minecraft:ocean minecraft:deep_ocean minecraft:river minecraft:beach minecraft:mushroom_fields minecraft:dark_forest minecraft:birch_forest minecraft:cherry_grove@1.20 minecraft:mangrove_swamp@1.19 minecraft:deep_dark@1.19 minecraft:lush_caves@1.17 minecraft:dripstone_caves@1.17 minecraft:meadow@1.18 minecraft:grove@1.18 minecraft:jagged_peaks@1.18 minecraft:nether_wastes minecraft:crimson_forest@1.16 minecraft:warped_forest@1.16 minecraft:soul_sand_valley@1.16 minecraft:basalt_deltas@1.16 minecraft:the_end minecraft:end_highlands`.split(/\s+/);

export const TIME_WORDS = ['day', 'night', 'noon', 'midnight'];
export const WEATHER = ['clear', 'rain', 'thunder'];
export const COLORS = ['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white'];

/** `{ name, since, until }` of an entry such as `name@1.19~1.20.4` */
export function parseEntry(entry: string): { name: string; since?: string; until?: string } {
    // a leading "@" belongs to the name (selectors), so look for the version marker after the first character
    const marker = entry.indexOf('@', 1);
    if (marker === -1) return { name: entry };
    const name = entry.slice(0, marker);
    const range = entry.slice(marker + 1);
    const [since, until] = range.split('~');
    return { name, since: since || undefined, until: until || undefined };
}
