const CACHE_NAME =
    "dani-chat-v1";


const APP_FILES = [

    "/",

    "/static/css/style.css",

    "/static/js/app.js",

    "/static/manifest.json"

];


self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
            .open(
                CACHE_NAME
            )
            .then(
                cache => {

                    return cache.addAll(
                        APP_FILES
                    );

                }
            )

        );

    }
);


self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches
            .keys()
            .then(
                keys => {

                    return Promise.all(

                        keys
                        .filter(
                            key =>
                                key !==
                                CACHE_NAME
                        )
                        .map(
                            key =>
                                caches.delete(
                                    key
                                )
                        )

                    );

                }
            )

        );

    }
);


self.addEventListener(
    "fetch",
    event => {

        /*
         * API and Socket.IO requests
         * should always use network.
         */

        if (
            event.request.url.includes(
                "/api/"
            )
        ) {

            return;
        }


        event.respondWith(

            caches
            .match(
                event.request
            )
            .then(
                cached => {

                    return (
                        cached ||
                        fetch(
                            event.request
                        )
                    );

                }
            )

        );

    }
);