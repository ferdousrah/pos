<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#15170f">
    <title>{{ config('app.name') }}</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2315170f'/%3E%3Cpath d='M10 8v16M10 16l9-8M13 13.5l9 10.5' stroke='%23e3ec78' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E">
    <script>
        window.__APP__ = { base: @json(rtrim(request()->getBasePath(), '/')), name: @json(config('app.name')) };
        try {
            const theme = localStorage.getItem('kontor.theme');
            if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
        } catch (e) {}
    </script>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.tsx'])
</head>
<body>
    <div id="root"></div>
</body>
</html>
