(function () {
    fetch('/posts.json')
        .then(responsse => response.json())
        .then(posts => {
            const list = document.getElementById('posts');
            posts.forEach(post => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="posts/${post.id}.html">${post.title}</a> = ${post.date}`;
                list.appendChild(li);
            });
        });
})();