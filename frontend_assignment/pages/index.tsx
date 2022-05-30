import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers, Contract, ethers, utils } from "ethers"
import Head from "next/head"
import React, { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import styles from "../styles/Home.module.css"

import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from "yup";
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json";
import type { NextApiRequest, NextApiResponse } from "next"

type InputForm = {
    name: string
    age: number
    address: string
}

const defaultValues = {
  name: "Eordan",
  age: 33,
  address: "",
};

const schema = yup.object({
    name: yup.string().required("Name is required"),
    age: yup.number().positive("Age must be more than zero").integer().nullable(),
    address: yup.string().max(42, "Address have to be less than 42 characters"),
}).required();

//const abi = ["event NewGreeting(bytes32 greeting)"];

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const { handleSubmit, register, reset, control,
    formState: { errors } } = useForm<FormValues>({defaultValues});
    const onSubmit: SubmitHandler<FormValues> = (data) => greet(JSON.stringify(data));
    const [data, setData] = useState("");
    const [greeting, setGreeting] = useState("")

    listener();
    async function listener() {
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
                                      Greeter.abi,
                                      provider)

        contract.on("NewGreeting", (greeting: string) => {
            setGreeting("New greeting: " + utils.parseBytes32String(greeting));
        })
    }

    async function greet(data) {

        setLogs("Creating your Semaphore identity...")
        console.log(data)
        schema.validate(data);
        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world!!!"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>
                <p className={styles.smalltitle}></p>
                <div className={styles.logs}>{logs}</div>
                <div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <div>
                                <p className={styles.smalltitle}>Please enter your name</p>
                                <input className={styles.textarea1}{...register("name")}/>
                                <span>{errors.name && errors.name.message}</span>
                            </div>
                            <div>
                                <p className={styles.smalltitle}>Please enter your address</p>
                                <input className={styles.textarea1}{...register("address")}/>
                                <span>{errors.address && errors.address.message}</span>
                            </div>
                            <div className="w-full">
                                <p className={styles.smalltitle}>Please enter your age</p>
                                <input className={styles.textarea1}{...register("age")}/>
                                <span>{errors.age && errors.age.message}</span>
                            </div>
                            <p className={styles.smalltitle}></p>
                            <div>
                                <button type="submit" className={styles.button}>
                                    Greet
                                </button>
                            </div>
                        </form>
                        <p className={styles.smalltitle}></p>
                        <div>
                            <p className={styles.textarea2}>{greeting}</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}