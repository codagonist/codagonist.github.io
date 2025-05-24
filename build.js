const fs = require('fs');
const path = require('path');

// Load data and templates
const posts = JSON.parse(fs.readFileSync('posts.json', 'utf8'));
const indexTemplate = fs.readFileSync('templates/index.html', 'utf8');
const postTemplate = fs.readFileSync('templates/post.html', 'utf8');

// Ensure output foldes
fs.rmSync('output', { recursive: true, force: true });
fs.mkdirSync('output/posts', { recursive: true });

// Generate post pages
const postLinks = posts.map(post => {
    const html = postTemplate 
        .replace('{{title}}/g', post.title)
        .replace('{{date}}/g', post.date)
        .replace('{{content}}/g', post.content);

    fs.writeFileSync(`output/posts/${post.id}.html`, html);
    return `<li><a href="posts/${post.id}.html">${post.title}</a> — ${post.date}</li>`;
}).join('\n');

// Generate index page
const indexHTML = indexTemplate.replace('{posts}', postLinks);
fs.writeFileSync('output/index.html', indexHTML);

// Copy static files (scripts, styles, favicon, etc.)
fs.cpSync('static', 'output', { recursive: true });

console.log('Site generated to /output');