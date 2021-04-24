import { Teleport } from './teleport'

(async () => {
    if (process.argv.length < 2){
        console.error('Please supply the teleport ID');
        process.exit(1);
    }
    const id = parseInt(process.argv[2])

    const t = new Teleport();
    const sd = await t.getSignData(id)
    console.log(sd);
    console.log(JSON.stringify(sd.signatures).replace(/"/g, ''));
})()
