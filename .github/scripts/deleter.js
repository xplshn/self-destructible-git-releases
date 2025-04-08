const { Octokit } = require('@octokit/rest');
const moment = require('moment');

// Initialize the Octokit client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Repository information
const owner = process.env.REPO_OWNER;
const repo = process.env.REPO_NAME || process.env.GITHUB_REPOSITORY.split('/')[1];

async function run() {
  console.log(`Starting cleanup for ${owner}/${repo}`);

  try {
    // Get all tags
    const { data: tags } = await octokit.repos.listTags({
      owner,
      repo,
      per_page: 100 // Adjust as needed
    });

    console.log(`Found ${tags.length} tags to check`);

    // Get all releases
    const { data: releases } = await octokit.repos.listReleases({
      owner,
      repo,
      per_page: 100 // Adjust as needed
    });

    console.log(`Found ${releases.length} releases to check`);

    // Process tags and releases
    for (const tag of tags) {
      if (shouldDeleteTag(tag.name)) {
        const release = releases.find(r => r.tag_name === tag.name);

        // If tag has a corresponding release, check if it should be deleted based on time patterns
        if (release) {
          if (shouldDeleteBasedOnTimePattern(release, tag.name)) {
            // Delete the release first
            console.log(`Deleting release: ${release.tag_name}`);
            await octokit.repos.deleteRelease({
              owner,
              repo,
              release_id: release.id
            });
          } else {
            console.log(`Skipping release ${release.tag_name} as time condition not met`);
            continue; // Skip tag deletion if time condition not met
          }
        }

        // Delete the tag
        console.log(`Deleting tag: ${tag.name}`);
        await octokit.git.deleteRef({
          owner,
          repo,
          ref: `refs/tags/${tag.name}`
        });
      }
    }

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

/**
 * Check if a tag name matches the criteria for deletion
 */
function shouldDeleteTag(tagName) {
  // Check if the tag matches 'temp_*' or its alias 'tmp_*'
  return tagName.startsWith('temp_') || tagName.startsWith('tmp_');
}

/**
 * Check if a release should be deleted based on time pattern in its tag name
 */
function shouldDeleteBasedOnTimePattern(release, tagName) {
  const createdAt = moment(release.created_at);
  const now = moment();
  const timeElapsed = now.diff(createdAt, 'minutes');

  // Match hour-based patterns: temp_1h to temp_9h or tmp_1h to tmp_9h
  const hourPattern = /^(?:temp|tmp)_([1-9])hs?$/;
  const hourMatch = tagName.match(hourPattern);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return timeElapsed >= hours * 60;
  }

  // Match minute-based patterns: temp_{10,15,20,25,30,35,40,45,50,55}m or tmp_{10,15,20,25,30,35,40,45,50,55}m
  const minutePattern = /^(?:temp|tmp)_((?:10|15|20|25|30|35|40|45|50|55))m$/;
  const minuteMatch = tagName.match(minutePattern);
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1], 10);
    return timeElapsed >= minutes;
  }

  // If no time pattern or doesn't match expected formats, always delete
  return true;
}

// Run the script
run();
