async function fetchLFG() {
  const res = await fetch('https://www.wowprogress.com/gearscore/us/?lfg=1&sortby=ts', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3',
    }
  });

  if (!res.ok) {
    console.log(`Failed to fetch LFG: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();

  const matches = body.matchAll(/href="\/character\/us\/([\w_-]+)\/(.+?)"/gm);

  const chars = [];
  for (const m of matches) {
    chars.push({
      id: `${m[1]}.${m[2]}`,
      server: m[1],
      name: m[2]
    });
  }

  return chars;
}

/**
 * @param {string} clientId
 * @param {string} clientSecret
 */
async function fetchToken(clientId, clientSecret) {

  const data = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });
  
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data.toString(),
  });

  if (!res.ok) {
    console.log(`Failed to fetch token: ${res.status} ${res.statusText}`);
  }
  
  const json = await res.json();
  return json.access_token;
}


/**
 * @param {string} accessToken
 * @param {string} server
 * @param {string} name
 */
async function fetchPlayerInfo(accessToken, server, name) {
  // Get player's server slug, server proper name, btag, and bio
  const res = await fetch(`https://www.wowprogress.com/character/us/${server}/${name}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3',
    }
  });

  if (!res.ok) {
    console.log(`Failed to fetch player wowprogress for ${name}: ${res.status} ${res.statusText}`);
  }

  const playerWowProg = await res.text();
  
  let match = playerWowProg.match(/<a class="nav_link" href="\/gearscore\/us\/[\w-]+\/">US-(.+?)<\/a>/);
  const serverStylized = match?.[1] ?? server; // zul-jin --> Zul'jin
  
  match = playerWowProg.match(/href="https:\/\/worldofwarcraft\.com\/en-us\/character\/([^/]+)\/[^"]+"/);
  const serverSlug = match?.[1] ?? server; // zul-jin --> zuljin

  match = playerWowProg.match(/<span class="profileBattletag">(.+?)<\/spanc>/);
  const battleTag = match?.[1] ?? "";

  match = playerWowProg.match(/<div class="charCommentary">(.+?)<\/div>/s);
  let comments = match?.[1] ?? "";
  comments = comments.replace(/<br>/g, "");
  comments = comments.length > 800 ? comments.slice(0, 800) + "..." : comments;

  // Get player's item level, spec info, and guild name
  const res2 = await fetch(`https://us.api.blizzard.com/profile/wow/character/${serverSlug}/${name.toLowerCase()}?namespace=profile-us&locale=en_US`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!res2.ok) {
    console.log(`Failed to fetch player item level for ${name}: ${res2.status} ${res2.statusText}`);
  }

  const playerProfile = await res2.json();
  const itemLevel = playerProfile?.equipped_item_level ?? "?";
  const className = playerProfile?.character_class?.name ?? "Default";
  const currentSpecId = playerProfile?.active_spec?.id ?? "Unknown";
  const guildName = playerProfile?.guild?.name ?? ""; 

  // Get player's specialization media thumbnail
  const res3 = await fetch(`https://us.api.blizzard.com/data/wow/media/playable-specialization/${currentSpecId}?namespace=static-us&locale=en_US`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!res3.ok) {
    console.log(`Failed to fetch player spec media for ${name}: ${res2.status} ${res2.statusText}`);
  }

  const blizzSpecMedia = await res3.json();
  const thumbnailURL = (Array.isArray(blizzSpecMedia?.assets) && blizzSpecMedia.assets.length > 0) 
      ? blizzSpecMedia.assets[0].value 
      : "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/WoW_icon.svg/1200px-WoW_icon.svg.png";

  // Get player's current mythic+ rating
  const res4 = await fetch(`https://us.api.blizzard.com/profile/wow/character/${serverSlug}/${name.toLowerCase()}/mythic-keystone-profile?namespace=profile-us&locale=en_US`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!res4.ok) {
    console.log(`Failed to fetch player mythic+ rating for ${name}: ${res4.status} ${res4.statusText}`);
  }

  const playerKeyProfile = await res4.json();
  const mythicPlusRating = Number.isFinite(playerKeyProfile?.current_mythic_rating?.rating) 
      ? Math.floor(playerKeyProfile.current_mythic_rating.rating) 
      : '?';

  // Get player's raid progression
  const res5 = await fetch(`https://us.api.blizzard.com/profile/wow/character/${serverSlug}/${name.toLowerCase()}/achievements?namespace=profile-us&locale=en_US`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!res5.ok) {
    console.log(`Failed to fetch player raid prog for ${name}: ${res5.status} ${res5.statusText}`);
  }

  const playerAch = await res5.json();

  /**
   * @param {number[]} raidIds
   */
  function getRaidKills(raidIds) {
    if (!playerAch) return "?";
    const kills = playerAch.achievements?.filter((/** @type {{ id: number; }} */ ach) => raidIds.includes(ach.id))?.length;
    return kills === null || kills === undefined ? "0" : kills;
  }
  
  // Mythic kills
  const voiRaidIds = [16346, 16347, 16348, 16349, 16350, 16351, 16352, 16353];
  const voiRaidKills = getRaidKills(voiRaidIds);
  
  const abbRaidIds = [18151, 18152, 18153, 18154, 18155, 18156, 18157, 18158, 18159];
  const abbRaidKills = getRaidKills(abbRaidIds);
  
  const adhRaidIds = [19335, 19336, 19337, 19338, 19339, 19340, 19341, 19342, 19343];
  const adhRaidKills = getRaidKills(adhRaidIds);
  
  const npRaidIds = [40236, 40237, 40238, 40239, 40240, 40241, 40242, 40243];
  const npRaidKills = getRaidKills(npRaidIds);
  
  const louRaidIds = [41229, 41230, 41231, 41232, 41233, 41234, 41235, 41236];
  const louRaidKills = getRaidKills(louRaidIds);

  const mfoRaidIds = [41604, 41605, 41606, 41607, 41608, 41609, 41610, 41611];
  const mfoRaidKills = getRaidKills(mfoRaidIds);
  

  function getAchievement(id) {
    return playerAch?.achievements?.filter((/** @type {{ id: number; }} */ ach) => ach.id === id)?.length || 0;
  }
  
  // Cutting edge
  const voiCE = getAchievement(17108);
  const abbCE = getAchievement(18254);
  const adhCE = getAchievement(19351);
  const npCE = getAchievement(40254);
  const louCE = getAchievement(41297);
  const mfoCE = getAchievement(41625);

  // Get player URLs
  const wowArmoryURL = `https://worldofwarcraft.com/en-us/character/us/${serverSlug}/${name.toLowerCase()}`;
  const raiderioURL = `https://raider.io/characters/us/${serverSlug}/${name.toLowerCase()}`;
  const wowProgressURL = `https://www.wowprogress.com/character/us/${server}/${name.toLowerCase()}`;
  const warcraftLogsURL = `https://www.warcraftlogs.com/character/us/${serverSlug}/${name.toLowerCase()}`;

  // Get embed class color
  const classColors = {
    'Death Knight':0xC41E3A,
    'Demon Hunter':0xA330C9,
    'Druid':0xFF7C0A,
    'Evoker':0x33937F,
    'Hunter':0xAAD372,
    'Mage':0x3FC7EB,
    'Monk':0x00FF98,
    'Paladin':0xF48CBA,
    'Priest':0xFFFFFF,
    'Rogue':0xFFF468,
    'Shaman':0x0070DD,
    'Warlock':0x8788EE,
    'Warrior':0xC69B6D,
    'Default':0x000000
}

  const webhookData = {
    "author": {
      "name": decodeURIComponent(name) + " | " + serverStylized + " | " + itemLevel + " ilvl | " + mythicPlusRating + " IO",
     },
    "thumbnail": {
      "url": thumbnailURL
     },
    "color": classColors[className],
    "fields": [
      {
        "name": "__Raid Progression__",
        "value": `**VoI:** ${voiRaidKills}/${voiRaidIds.length} M ${voiCE ? "[CE]" : ""}\n` +
        `**ASC:** ${abbRaidKills}/${abbRaidIds.length} M ${abbCE ? "[CE]" : ""}\n` +
        `**ADH:** ${adhRaidKills}/${adhRaidIds.length} M ${adhCE ? "[CE]" : ""}\n` +
        `**NP:** ${npRaidKills}/${npRaidIds.length} M ${npCE ? "[CE]" : ""}\n` +
        `**LoU:** ${louRaidKills}/${louRaidIds.length} M ${louCE ? "[CE]" : ""}\n` +
        `**MFO:** ${mfoRaidKills}/${mfoRaidIds.length} M ${mfoCE ? "[CE]" : ""}`,
        "inline": true
      },
      {
        "name": "__Current Guild__",
        "value": guildName,
        "inline": true
      },
      {
        "name": "__BattleTag__",
        "value": battleTag,
        "inline": true
      },
      {
        "name": "__Comments__",
        "value": comments,
        "inline": false
      },
      {
        "name": "__Links__",
        "value": `[Armory](${wowArmoryURL}) | [RaiderIO](${raiderioURL}) | [WoWProgress](${wowProgressURL}) | [WarcraftLogs](${warcraftLogsURL})`,
        "inline": true
      }
    ]
  }

  if (voiCE || abbCE || adhCE || npCE || louCE || mfoCE || npRaidKills >= 2 || louRaidKills >= 2 || mfoRaidKills >= 2 || className == "Default") {
    return webhookData;
  } else {
    return false;
  }

}

/**
 * @param {{author: {name: string;};thumbnail: {url: string;};color: number;fields: {name: string;value: string;inline: boolean;}[];}} webhookData
 * @param {string} webhookURL
 */
async function sendWebhook(webhookData, webhookURL) {

  const data = {
    "embeds": [webhookData]
  };

  const res = await fetch(webhookURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    console.log(`Failed to send webhook data for ${webhookData.author.name}: ${res.status} ${res.statusText}`);
    return false;
  } else {
    console.log(`Sent webhook data for ${webhookData.author.name}`);
    return true;
  }  
}

// Cron 15 minute trigger
export default {
  /**
   * Scheduled event handler for Cloudflare Workers
   * @param {any} event
   * @param {{ lfg: { get: (arg0: string) => any; put: (arg0: string, arg1: string) => any; }; BNET_ID: any; BNET_SECRET: any; }} env
   * @param {any} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.processLFG(env));
  },

  async processLFG(env) {
    // Fetch from wowprog
    const all = await fetchLFG();
  
    // Filter characters we've seen recently
    let lfg = all;
    const prevRaw = await env.lfg.get('prev');
    let prev = [];
  
    if (prevRaw) {
      prev = JSON.parse(prevRaw);
      lfg = all.filter((l) => !prev.includes(l.id));
  
      // Filter "new listees" at the bottom to prevent de-listers tricking the script
      const bottomSlice = all.slice(-5).map((l) => l.id);
      lfg = lfg.filter((l) => !bottomSlice.includes(l.id));
    }
  
    const failedPlayers = []; // List to track webhook failures
  
    // Get Blizzard API token
    const token = await fetchToken(env.BNET_ID, env.BNET_SECRET);
  
    for (const player of lfg) {
      const webhookData = await fetchPlayerInfo(token, player.server, player.name);
      if (webhookData) {
        const ret = await sendWebhook(webhookData, env.DISCORD_WEBHOOK);
        if (!ret) {
          failedPlayers.push(`${player.server}.${player.name}`);
        }
      } else {
        console.log(`Filtered ${decodeURIComponent(player.name)}-${player.server}`);
      }
    }
  
    // Remove failed players from prev
    prev = prev.filter((id) => !failedPlayers.includes(id));
  
    // Store updated prev result
    await env.lfg.put('prev', JSON.stringify(all.map((l) => l.id).filter((id) => !failedPlayers.includes(id))));
  },
};

// Debugging (must enable workers.dev domain in settings)
// export default {
//   /**
//    * @param {any} request
//    * @param {{ lfg: { get: (arg0: string) => any; put: (arg0: string, arg1: string) => any; }; BNET_ID: any; BNET_SECRET: any; }} env
//    * @param {any} ctx
//    */
//   async fetch(request, env, ctx) {
//     const all = await fetchLFG();

//     let lfg = all;
//     const prevRaw = await env.lfg.get('prev');

//     if(prevRaw) {
//       const prev = JSON.parse(prevRaw);
//       lfg = all.filter((l) => !prev.includes(l.id));
//     }

//     await env.lfg.put('prev', JSON.stringify(all.map((l) => l.id)));

//     const token = await fetchToken(env.BNET_ID, env.BNET_SECRET);
//     const testData = ["zul-jin.Ioannides","sargeras.Chrysus","thrall.Bobate%C3%A4","dalaran.Brixion","frostmourne.Asdaral","illidan.Tr%C3%A2ps","area-52.Getrights","area-52.Getright","frostmourne.Kallaen","moon-guard.Warcron","zul-jin.Datbagels","tichondrius.Scottye","proudmoore.Sarutahiko","area-52.Nadlerpos","area-52.Authentikz","zul-jin.Sflukablak","mal-ganis.Yaengsham","thunderhorn.Elamlock","bleeding-hollow.Glockateer","frostmourne.Tape","illidan.Denylock","thrall.Cerai","barthilas.Saket"]

//     for (const player of testData) {  // const player in lfg
//       const webhookData = await fetchPlayerInfo(token, player.server, player.name);
//       if (webhookData) {
//         await sendWebhook(webhookData, env.DEBUG_DISCORD_WEBHOOK);
//       } else {
//         console.log(`Filtered ${decodeURIComponent(player)}`);
//       }
//     }

//     return new Response(JSON.stringify(lfg));
//   },
// };
