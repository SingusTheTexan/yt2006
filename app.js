// YouTube API key handling 
let API_KEY = ''; // Remove hardcoded key

// Modified initialization function 
async function initializeApi() {
  // Prompt user for API key if not already stored
  let apiKey = localStorage.getItem('youtubeApiKey');
  
  if (!apiKey) {
    apiKey = prompt('Please enter your YouTube Data API Key. You can get one from https://console.cloud.google.com/apis/credentials');
    
    if (!apiKey) {
      throw new Error('YouTube API key is required');
    }
    
    // Store for future use
    localStorage.setItem('youtubeApiKey', apiKey);
  }

  API_KEY = apiKey; // Set the API key for use

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    
    script.onload = () => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            'apiKey': apiKey,
            'discoveryDocs': ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
          });
          console.log('YouTube Data API v3 initialized successfully');
          await loadInitialContent();
          resolve();
        } catch (error) {
          console.error('Error initializing YouTube API:', error);
          // Clear stored key if invalid
          localStorage.removeItem('youtubeApiKey'); 
          handleApiError();
          reject(error);
        }
      });
    };
    
    script.onerror = () => {
      console.error('Failed to load Google API client');
      handleApiError();
      reject(new Error('Failed to load Google API client'));
    };

    document.body.appendChild(script);
  });
}

// Load initial content after API initialization
async function loadInitialContent() {
  try {
    await Promise.all([
      loadMostViewedVideos('today', 1),
      loadChannels('mostSubscribed'),
      loadFeaturedVideos(),
      loadActiveChannels(),
      loadDirectorVideos()
    ]);
  } catch (error) {
    console.error('Error loading initial content:', error);
    handleApiError();
  }
}

// Modified loadChannels function to use v3 API
async function loadChannels(type = 'mostSubscribed') {
  try {
    // Update UI to show active channel type
    document.querySelectorAll('.sub-nav a').forEach(link => {
      link.classList.remove('active');
      if (link.textContent.toLowerCase().includes(type.toLowerCase())) {
        link.classList.add('active');
      }
    });

    // Update header text
    const header = document.querySelector('.channel-grid-header strong');
    if (header) {
      header.textContent = {
        mostSubscribed: 'Most Subscribed Channels',
        recent: 'Recent Channels',
        mostViewed: 'Most Viewed Channels'
      }[type] || 'Most Subscribed Channels';
    }

    const response = await gapi.client.youtube.channels.list({
      part: 'snippet,statistics',
      maxResults: 20,
      order: type === 'mostSubscribed' ? 'subscriberCount' : 
             type === 'recent' ? 'date' : 'viewCount',
      regionCode: 'US'
    });

    const grid = document.getElementById('channel-grid');
    if (!grid) return;

    grid.innerHTML = '';

    response.result.items.forEach(channel => {
      const channelElement = document.createElement('div');
      channelElement.className = 'video-item';
      channelElement.innerHTML = `
        <a href="https://youtube.com/channel/${channel.id}" target="_blank">
          <img src="${channel.snippet.thumbnails.medium.url}" alt="${channel.snippet.title}">
        </a>
        <div class="channel-info">
          <a href="https://youtube.com/channel/${channel.id}" target="_blank" class="video-title">
            ${channel.snippet.title}
          </a>
          <div class="video-stats">
            <div>Subscribers: ${formatNumber(channel.statistics.subscriberCount)}</div>
            <div>Views: ${formatNumber(channel.statistics.viewCount)}</div>
            <div>Videos: ${formatNumber(channel.statistics.videoCount)}</div>
          </div>
        </div>
      `;
      
      grid.appendChild(channelElement);
    });

    // Update channel count
    const countElement = document.querySelector('.channel-count');
    if (countElement) {
      countElement.textContent = `Channels 1-${response.result.items.length} of ${response.result.pageInfo.totalResults}`;
    }
  } catch (error) {
    console.error('Error loading channels:', error);
    handleApiError();
  }
}

// Update loadMostViewedVideos function to handle pagination
async function loadMostViewedVideos(timeFrame = 'today', page = 1) {
  // Update active time filter and pagination
  document.querySelectorAll('.time-filter a').forEach(link => {
    link.classList.remove('active');
    if (link.textContent.toLowerCase().includes(timeFrame)) {
      link.classList.add('active');
    }
  });

  // Set publishedAfter based on timeFrame
  let publishedAfter = new Date();
  switch(timeFrame) {
    case 'week':
      publishedAfter.setDate(publishedAfter.getDate() - 7);
      break;
    case 'month':
      publishedAfter.setMonth(publishedAfter.getMonth() - 1);
      break;
    case 'all':
      publishedAfter = null;
      break;
    default: // today
      publishedAfter.setDate(publishedAfter.getDate() - 1);
  }

  try {
    const maxResults = 20; // Videos per page
    const startIndex = (page - 1) * maxResults + 1;

    const requestParams = {
      part: 'snippet,statistics',
      chart: 'mostPopular',
      maxResults: maxResults,
      regionCode: 'US',
      pageToken: page > 1 ? sessionStorage.getItem(`pageToken_${timeFrame}_${page-1}`) : undefined
    };

    if (publishedAfter) {
      requestParams.publishedAfter = publishedAfter.toISOString();
    }

    const response = await gapi.client.youtube.videos.list(requestParams);
    
    // Store next page token
    if (response.result.nextPageToken) {
      sessionStorage.setItem(`pageToken_${timeFrame}_${page}`, response.result.nextPageToken);
    }

    const grid = document.getElementById('video-grid');
    if (!grid) return;

    grid.innerHTML = '';

    response.result.items.forEach(video => {
      const videoElement = document.createElement('div');
      videoElement.className = 'video-item';
      videoElement.innerHTML = `
        <a href="#" onclick="loadVideo('${video.id}'); return false;">
          <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
        </a>
        <a href="#" onclick="loadVideo('${video.id}'); return false;" class="video-title">
          ${video.snippet.title}
        </a>
        <div class="video-stats">
          Views: ${formatNumber(video.statistics.viewCount)}<br>
          From: ${video.snippet.channelTitle}
        </div>
        <div class="video-rating">
          ${generateStarsHTML(calculateVideoScore(video))}
        </div>
      `;
      
      grid.appendChild(videoElement);
    });

    // Update pagination
    updatePagination(page, timeFrame);
    
    // Update video count
    const countElement = document.querySelector('.video-count');
    if (countElement) {
      countElement.textContent = ` Videos ${startIndex}-${startIndex + response.result.items.length - 1}`;
    }

  } catch (error) {
    console.error('Error loading videos:', error);
    handleApiError();
  }
}

// Add pagination update function
function updatePagination(currentPage, timeFrame) {
  const paginationDiv = document.querySelector('.pagination');
  if (!paginationDiv) return;

  const maxPages = 4;
  let html = '<span>Pages:</span> ';
  
  for (let i = 1; i <= maxPages; i++) {
    html += `<a href="#" ${i === currentPage ? 'class="active"' : ''} 
      onclick="loadMostViewedVideos('${timeFrame}', ${i}); return false;">${i}</a> `;
  }
  
  if (currentPage < maxPages) {
    html += `<a href="#" onclick="loadMostViewedVideos('${timeFrame}', ${currentPage + 1}); return false;">Next »</a>`;
  }
  
  paginationDiv.innerHTML = html;
}

// Modified loadDirectorVideos function
async function loadDirectorVideos() {
  try {
    // Search for videos from channels marked as "director" or "creator" content
    const response = await gapi.client.youtube.search.list({
      part: 'snippet',
      maxResults: 12, // Increased to ensure we get enough valid results
      type: 'video',
      q: 'film director OR filmmaker', // More specific search terms
      videoCategoryId: '1', // Film & Animation category
      order: 'date', // Get latest director videos
      safeSearch: 'none'
    });

    const container = document.querySelector('.video-thumbnails');
    if (!container || !response.result.items) return;

    container.innerHTML = '';

    // Get full video details for each search result
    const videoIds = response.result.items.map(item => item.id.videoId);
    const videoDetailsResponse = await gapi.client.youtube.videos.list({
      part: 'snippet,statistics',
      id: videoIds.join(',')
    });

    const videos = videoDetailsResponse.result.items;
    if (!videos) return;

    let directorVideosCount = 0;
    const requiredCount = 4;

    videos.forEach(video => {
      // More comprehensive check for director/filmmaker content
      const isDirectorContent = 
        video.snippet.channelTitle.toLowerCase().includes('director') || 
        video.snippet.channelTitle.toLowerCase().includes('filmmaker') ||
        video.snippet.description.toLowerCase().includes('directed by') ||
        video.snippet.description.toLowerCase().includes('film by') ||
        video.snippet.title.toLowerCase().includes('director') ||
        video.snippet.tags?.some(tag => 
          tag.toLowerCase().includes('director') || 
          tag.toLowerCase().includes('filmmaker')
        );
      
      if (isDirectorContent && directorVideosCount < requiredCount) {
        const videoElement = document.createElement('div');
        videoElement.innerHTML = `
          <a href="#" onclick="loadVideo('${video.id}'); return false;">
            <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
            <span class="video-title">${video.snippet.title}</span>
          </a>
        `;
        container.appendChild(videoElement);
        directorVideosCount++;
      }
    });

    // If we still don't have enough videos, make another request with different search terms
    if (directorVideosCount < requiredCount) {
      const additionalResponse = await gapi.client.youtube.search.list({
        part: 'snippet',
        maxResults: 8,
        type: 'video',
        q: 'short film director', // Alternative search terms
        videoCategoryId: '1',
        order: 'rating' // Get highly rated content
      });

      const additionalVideoIds = additionalResponse.result.items.map(item => item.id.videoId);
      const additionalDetailsResponse = await gapi.client.youtube.videos.list({
        part: 'snippet,statistics',
        id: additionalVideoIds.join(',')
      });

      const additionalVideos = additionalDetailsResponse.result.items;
      if (additionalVideos) {
        additionalVideos.forEach(video => {
          if (directorVideosCount < requiredCount) {
            const videoElement = document.createElement('div');
            videoElement.innerHTML = `
              <a href="#" onclick="loadVideo('${video.id}'); return false;">
                <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
                <span class="video-title">${video.snippet.title}</span>
              </a>
            `;
            container.appendChild(videoElement);
            directorVideosCount++;
          }
        });
      }
    }
  } catch (error) {
    console.error('Error loading director videos:', error);
    handleApiError();
  }
}

// Rest of the code remains the same...
async function loadFeaturedVideos() {
  const request = gapi.client.youtube.videos.list({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    maxResults: 10,
    regionCode: 'US'
  });

  request.execute(response => {
    const container = document.getElementById('featured-videos-list');
    if (container && response.items) {
      container.innerHTML = '';
      response.items.forEach(video => {
        const score = calculateVideoScore(video);
        const starsHTML = generateStarsHTML(score);
        const duration = formatDuration(video.contentDetails?.duration || 'PT0M0S');
        const daysAgo = getDaysAgo(video.snippet.publishedAt);
        const tags = video.snippet.tags ? video.snippet.tags.slice(0, 3).join(' ') : '';
        
        const videoElement = document.createElement('div');
        videoElement.className = 'featured-video-item';
        videoElement.innerHTML = `
          <a href="#" onclick="loadVideo('${video.id}'); return false;">
            <img src="${video.snippet.thumbnails.default.url}" alt="${video.snippet.title}">
            <div class="featured-video-info">
              <h4><u>${video.snippet.title}</u></h4>
              <p><strong>${duration}</strong></p>
              <p>From: ${video.snippet.channelTitle}</p>
              <p>Added: ${daysAgo}</p>
              ${tags ? `<p>Tags: ${tags}</p>` : ''}
              <div class="views">${video.statistics.viewCount.replace(/,/g, '')}</div>
              <div class="rating">${starsHTML}</div>
            </div>
          </a>
        `;
        container.appendChild(videoElement);
      });
    }
  });
}

function loadActiveChannels() {
  const request = gapi.client.youtube.channels.list({
    part: 'snippet,statistics',
    maxResults: 3,
    order: 'videoCount'
  });

  request.execute(response => {
    const container = document.getElementById('active-channels-list');
    if (container && response.items) {
      container.innerHTML = '';
      response.items.forEach(channel => {
        const channelElement = document.createElement('div');
        channelElement.className = 'channel-item';
        channelElement.innerHTML = `
          <img src="${channel.snippet.thumbnails.default.url}" alt="${channel.snippet.title}">
          <div>
            <strong>${channel.snippet.title}</strong><br>
            ${channel.statistics.videoCount} Videos | ${channel.statistics.subscriberCount} Subscribers
          </div>
        `;
        container.appendChild(channelElement);
      });
    }
  });
}

function loadVideo(videoId) {
  // Hide all other pages
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('videos-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'none';
  document.getElementById('channel-page').style.display = 'none';
  
  // Show video page
  const videoPage = document.getElementById('video-page');
  videoPage.style.display = 'block';

  if (player) {
    player.destroy();
  }

  player = new YT.Player('player', {
    height: '390',
    width: '640',
    videoId: videoId,
    playerVars: {
      'playsinline': 1,
      'modestbranding': 1,
      'rel': 0
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });

  // Update video info
  gapi.client.youtube.videos.list({
    part: 'snippet,statistics,contentDetails',
    id: videoId
  }).then(response => {
    if (response.result.items && response.result.items[0]) {
      const video = response.result.items[0];
      document.getElementById('video-title').textContent = video.snippet.title;
      document.getElementById('view-count').textContent = formatNumber(video.statistics.viewCount);
      document.getElementById('upload-date').textContent = new Date(video.snippet.publishedAt).toLocaleDateString();
      document.getElementById('channel-name').textContent = video.snippet.channelTitle;
      
      // Update video details sidebar with more complete information
      const detailsHtml = `
        <div style="padding: 10px;">
          <p style="margin-bottom: 10px;">Added: ${new Date(video.snippet.publishedAt).toLocaleDateString()}</p>
          <p style="margin-bottom: 10px;">From: <a href="#" style="color: #00c;">${video.snippet.channelTitle}</a></p>
          <p style="margin-bottom: 10px;">
            <img src="https://web.archive.org/web/20060712123125im_/http://youtube.com/img/sub_button14.gif" alt="Subscribe" style="vertical-align: middle;">
          </p>
          <p style="margin-bottom: 10px;">Tags: ${(video.snippet.tags || []).join(', ')}</p>
          <p style="margin-bottom: 10px;">URL: <a href="https://youtube.com/watch?v=${videoId}" style="color: #00c;">youtube.com/watch?v=${videoId}</a></p>
          <p>Embed: <input type="text" value='<object width="425" height="350"><param name="movie" value="https://youtube.com/v/${videoId}"></param></object>' style="width: 100%; font-size: 11px; padding: 2px;" onclick="this.select()"></p>
        </div>
      `;
      
      const detailsSidebar = document.getElementById('video-details-sidebar');
      if (detailsSidebar) {
        detailsSidebar.innerHTML = detailsHtml;
      }
      
      updateRating(video);
      loadRelatedVideos(videoId);
    }
  }).catch(err => {
    console.error('Error loading video details:', err);
  });
  
  loadComments(videoId);
}

function loadRelatedVideos(videoId) {
  const request = gapi.client.youtube.search.list({
    part: 'snippet',
    relatedToVideoId: videoId,
    type: 'video',
    maxResults: 10
  });

  request.execute(response => {
    const container = document.getElementById('related-videos');
    container.innerHTML = '';

    if (response.items) {
      response.items.forEach(item => {
        const videoElement = document.createElement('a');
        videoElement.href = '#';
        videoElement.className = 'related-video';
        videoElement.onclick = () => {
          loadVideo(item.id.videoId);
          return false;
        };

        videoElement.innerHTML = `
          <img src="${item.snippet.thumbnails.default.url}" alt="${item.snippet.title}">
          <div class="related-video-info">
            <h4><u><strong>${item.snippet.title}</strong></u></h4>
            <p>From: ${item.snippet.channelTitle}</p>
          </div>
        `;
        
        container.appendChild(videoElement);
      });
    }
  });
}

function showHomePage() {
  if (player) {
    player.stopVideo();
  }
  document.getElementById('home-page').style.display = 'block';
  document.getElementById('videos-page').style.display = 'none';
  document.getElementById('video-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'none';
  
  // Reset header text
  const header = document.querySelector('.channel-grid-header strong');
  if (header) header.textContent = '';
  
  // Update active nav
  document.querySelectorAll('.main-nav a').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector('.main-nav a[href="/"]').classList.add('active');
}

function onYouTubeIframeAPIReady() {
  // Player will be initialized when a video is selected
}

function onPlayerReady(event) {
  event.target.playVideo();
}

function onPlayerStateChange(event) {
  // Handle player state changes if needed
}

function formatNumber(num) {
  return parseInt(num).toString();
}

function calculateVideoScore(video) {
  if (video.statistics && video.statistics.likeCount) {
    const likes = parseInt(video.statistics.likeCount);
    const dislikes = parseInt(video.statistics.dislikeCount) || 0;
    const total = likes + dislikes;
    return total > 0 ? Math.round((likes / total) * 10) / 2 : 0;
  }
  return 0;
}

function generateStarsHTML(score) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    let starImg;
    if (score >= i) {
      starImg = "https://web.archive.org/web/20060705021642im_/http://www.youtube.com/img/star_sm.gif";
    } else if (score + 0.5 >= i) {
      starImg = "https://web.archive.org/web/20060705021622im_/http://www.youtube.com/img/star_sm_half.gif";
    } else {
      starImg = "https://web.archive.org/web/20060705021630im_/http://www.youtube.com/img/star_sm_bg.gif";
    }
    html += `<img src="${starImg}" alt="★">`;
  }
  return html;
}

function updateRating(video) {
  if (video.statistics && video.statistics.likeCount) {
    const likes = parseInt(video.statistics.likeCount);
    const dislikes = parseInt(video.statistics.dislikeCount) || 0;
    const total = likes + dislikes;
    
    if (total > 0) {
      const score = Math.round((likes / total) * 10) / 2; // Convert to 0-5 scale with half stars
      
      function getStarImage(position, score) {
        if (score >= position) {
          return "https://web.archive.org/web/20060705021642im_/http://www.youtube.com/img/star_sm.gif"; // Full star
        } else if (score + 0.5 >= position) {
          return "https://web.archive.org/web/20060705021622im_/http://www.youtube.com/img/star_sm_half.gif"; // Half star
        } else {
          return "https://web.archive.org/web/20060705021630im_/http://www.youtube.com/img/star_sm_bg.gif"; // Empty star
        }
      }

      // Update both video page and featured video ratings
      document.querySelectorAll('.stars, .rating').forEach(ratingContainer => {
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
          starsHTML += `<img src="${getStarImage(i, score)}" alt="★">`;
        }
        const starsElement = ratingContainer.querySelector('.stars');
        if (starsElement) {
          starsElement.innerHTML = starsHTML;
        } else {
          // For featured videos that have direct rating content
          const ratingText = `★★★★★ ${formatNumber(video.statistics.viewCount)} views`;
          ratingContainer.innerHTML = ratingText;
        }
      });

      // Update rating count
      const ratingCountElement = document.getElementById('rating-count');
      if (ratingCountElement) {
        ratingCountElement.textContent = total.toLocaleString();
      }
    }
  }
}

function formatDuration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  
  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');

  let formatted = '';
  if (hours) formatted += `${hours}:`;
  formatted += `${minutes.padStart(2, '0')}:`;
  formatted += seconds.padStart(2, '0');
  
  return formatted;
}

function getDaysAgo(dateString) {
  const uploadDate = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - uploadDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

// Search functionality
async function searchVideos(page = 'home') {
  const searchInput = document.getElementById(`search-input-${page}`);
  const searchType = document.getElementById(`search-type-${page}`);
  
  if (!searchInput || !searchInput.value) return;

  // Show search page
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('videos-page').style.display = 'none'; 
  document.getElementById('video-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'block';
  document.getElementById('channel-page').style.display = 'none';

  // Update navigation active state
  document.querySelectorAll('.main-nav a').forEach(link => {
    link.classList.remove('active');
  });

  const query = searchInput.value;
  const searchCountElement = document.querySelector('.search-count');
  if (searchCountElement) {
    searchCountElement.textContent = ` for "${query}"`;
  }
  
  const grid = document.getElementById('search-results-grid');
  if (!grid) return;
  
  grid.innerHTML = '<div style="text-align: center; padding: 20px;">Loading search results...</div>';
  
  try {
    if (searchType.value === 'videos') {
      const response = await gapi.client.youtube.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 20,
        safeSearch: 'none'
      });

      grid.innerHTML = '';

      if (response.result.items && response.result.items.length > 0) {
        // Get detailed video information
        const videoIds = response.result.items.map(item => item.id.videoId);
        const detailsResponse = await gapi.client.youtube.videos.list({
          part: 'snippet,statistics',
          id: videoIds.join(',')
        });

        const videoDetails = {};
        detailsResponse.result.items.forEach(video => {
          videoDetails[video.id] = video;
        });

        response.result.items.forEach(item => {
          const video = videoDetails[item.id.videoId] || item;
          const videoElement = document.createElement('div');
          videoElement.className = 'video-item';
          videoElement.innerHTML = `
            <a href="#" onclick="loadVideo('${item.id.videoId}'); return false;">
              <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}">
            </a>
            <a href="#" onclick="loadVideo('${item.id.videoId}'); return false;" class="video-title">
              ${item.snippet.title}
            </a>
            <div class="video-stats">
              ${video.statistics ? `Views: ${formatNumber(video.statistics.viewCount)}<br>` : ''}
              From: ${item.snippet.channelTitle}<br>
              Added: ${new Date(item.snippet.publishedAt).toLocaleDateString()}
            </div>
            ${video.statistics ? `<div class="video-rating">
              ${generateStarsHTML(calculateVideoScore(video))}
            </div>` : ''}
          `;
          
          grid.appendChild(videoElement);
        });
      } else {
        grid.innerHTML = '<div style="text-align: center; padding: 20px;">No videos found matching your search.</div>';
      }
    } else if (searchType.value === 'channels') {
      const response = await gapi.client.youtube.search.list({
        part: 'snippet',
        q: query,
        type: 'channel',
        maxResults: 20
      });

      grid.innerHTML = '';

      if (response.result.items && response.result.items.length > 0) {
        // Get detailed channel information
        const channelIds = response.result.items.map(item => item.id.channelId);
        const detailsResponse = await gapi.client.youtube.channels.list({
          part: 'snippet,statistics',
          id: channelIds.join(',')
        });

        const channelDetails = {};
        detailsResponse.result.items.forEach(channel => {
          channelDetails[channel.id] = channel;
        });

        response.result.items.forEach(item => {
          const channel = channelDetails[item.id.channelId];
          const channelElement = document.createElement('div');
          channelElement.className = 'video-item';
          channelElement.innerHTML = `
            <a href="https://youtube.com/channel/${item.id.channelId}" target="_blank">
              <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}">
            </a>
            <div class="channel-info">
              <a href="https://youtube.com/channel/${item.id.channelId}" target="_blank" class="video-title">
                ${item.snippet.title}
              </a>
              ${channel ? `
                <div class="video-stats">
                  <div>Subscribers: ${formatNumber(channel.statistics.subscriberCount)}</div>
                  <div>Views: ${formatNumber(channel.statistics.viewCount)}</div>
                  <div>Videos: ${formatNumber(channel.statistics.videoCount)}</div>
                </div>
              ` : `
                <div class="video-stats">
                  ${item.snippet.description}
                </div>
              `}
            </div>
          `;
          
          grid.appendChild(channelElement);
        });
      } else {
        grid.innerHTML = '<div style="text-align: center; padding: 20px;">No channels found matching your search.</div>';
      }
    }
  } catch (error) {
    console.error('Search error:', error);
    grid.innerHTML = '<div style="text-align: center; padding: 20px;">An error occurred while searching. Please try again.</div>';
  }

  // Clear search input after search
  searchInput.value = '';
}

function showSearchPage() {
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('videos-page').style.display = 'none';
  document.getElementById('video-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'block';
}

function loadChannel(channelId) {
  const request = gapi.client.youtube.channels.list({
    part: 'snippet,statistics',
    id: channelId
  });

  request.execute(response => {
    if (response.items && response.items[0]) {
      const channel = response.items[0];
      // Load channel details and videos
      loadChannelContent(channel);
    }
  });
}

function loadChannelContent(channel) {
  // You can implement channel page view here
  console.log('Loading channel:', channel.snippet.title);
}

function updateActiveNav(activeLink) {
  document.querySelectorAll('.main-nav a').forEach(link => {
    link.classList.remove('active');
  });
  activeLink.classList.add('active');
}

function showChannels() {
  // Hide all other pages
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('videos-page').style.display = 'none';
  document.getElementById('video-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'none';
  document.getElementById('channel-page').style.display = 'block';
  
  // Update navigation active state
  document.querySelectorAll('.main-nav a').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector('.main-nav a[href="/channels"]').classList.add('active');

  // Load channels with default "mostSubscribed" type
  loadChannels('mostSubscribed');
}

function showVideos(timeFrame = 'today') {
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('video-page').style.display = 'none';
  document.getElementById('search-page').style.display = 'none';
  document.getElementById('videos-page').style.display = 'block';
  document.getElementById('channel-page').style.display = 'none';

  // Update navigation
  document.querySelectorAll('.main-nav a').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector('.main-nav a[href="/videos"]').classList.add('active');

  // Update header text based on time period
  const header = document.querySelector('.channel-grid-header strong');
  if (header) {
    header.textContent = 'Most Viewed Videos';
  }

  // Load videos with specified time frame
  loadMostViewedVideos(timeFrame, 1);
}

let player;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeApi();
    
    // Add enter key listeners for search input on each page
    ['home', 'search', 'channels', 'videos', 'video'].forEach(page => {
      const searchInput = document.getElementById(`search-input-${page}`);
      if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            searchVideos(page);
          }
        });
      }
    });

  } catch (error) {
    console.error('Failed to initialize API:', error);
    handleApiError();
  }
});

// Add handleApiError function
function handleApiError() {
  const grid = document.getElementById('channel-grid');
  if (grid) {
    grid.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #666;">
        Error loading content. Please try again later.
      </div>
    `;
  }
}

async function loadComments(videoId) {
  try {
    // Get video comments with increased maxResults
    const response = await gapi.client.youtube.commentThreads.list({
      part: 'snippet',
      videoId: videoId,
      maxResults: 100, // Increased from 10 to 100 comments
      order: 'time'
    });

    const commentsContainer = document.getElementById('comments-container');
    if (!commentsContainer || !response.result.items) return;

    commentsContainer.innerHTML = `
      <div class="post-comment">
        <h4>Post a Comment:</h4>
        <textarea id="comment-text" rows="3" cols="50"></textarea>
        <div class="comment-actions">
          <button onclick="postComment('${videoId}')">Post Comment</button>
          <span>(comment will be added under your channel name)</span>
        </div>
      </div>
      <div class="existing-comments">
        <h4>Comments (${response.result.items.length})</h4>
      </div>
    `;

    const existingComments = commentsContainer.querySelector('.existing-comments');
    
    response.result.items.forEach(item => {
      const comment = item.snippet.topLevelComment.snippet;
      const commentDiv = document.createElement('div');
      commentDiv.className = 'comment';
      const daysAgo = getDaysAgo(comment.publishedAt);
      
      commentDiv.innerHTML = `
        <div class="comment-header">
          <a href="/channel/${comment.authorChannelId}" class="comment-author">${comment.authorDisplayName}</a>
          <span class="comment-date">(${daysAgo})</span>
        </div>
        <div class="comment-text">${comment.textDisplay}</div>
        <div class="comment-actions">
          <a href="#" onclick="replyToComment('${item.id}'); return false;">(reply to this)</a>
        </div>
      `;
      
      existingComments.appendChild(commentDiv);
    });

  } catch (error) {
    console.error('Error loading comments:', error);
    const commentsContainer = document.getElementById('comments-container');
    if (commentsContainer) {
      commentsContainer.innerHTML = '<p>Comments are currently unavailable.</p>';
    }
  }
}
